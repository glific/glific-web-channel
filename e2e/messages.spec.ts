import { expect, test, type Page } from '@playwright/test';

import { DARK_ACCENT_ORG, serveBranding } from './support/branding';
import { seedSession } from './support/auth';
import { tokenExpiringIn } from './support/token';
import { mockPhoenix, type MockPhoenix } from './support/socket';
import {
  HOSTED_URL,
  PDF_FIXTURE,
  PNG_FIXTURE,
  stubStoragePut,
  stubStoragePutFailure,
  stubUploadUrl,
  stubUploadUrlError,
} from './support/media';

/**
 * Sending from the chat — glific#5714 and its widget half.
 *
 * Everything a message travels over is stubbed: branding, the socket, the signing endpoint and
 * Google. What is real is the widget's own contract — what it puts on the wire, and what it does
 * when each hop fails.
 */

const CONTACT_ID = 42;

// Signed in and joined, which every journey below starts from.
const openChat = async (page: Page, options: Parameters<typeof mockPhoenix>[1] = {}): Promise<MockPhoenix> => {
  await serveBranding(page, DARK_ACCENT_ORG);
  await seedSession(page, tokenExpiringIn(3600), CONTACT_ID);
  const socket = await mockPhoenix(page, options);

  await page.goto('/chat');
  await expect(page.getByTestId('webChannelChat')).toBeVisible();
  // The header reads "online" only once the join is acknowledged; without waiting, a send races
  // the channel.
  await expect(page.getByTestId('connectionStatus')).toHaveText('online');

  return socket;
};

const attach = (page: Page, file: typeof PNG_FIXTURE) => page.getByTestId('fileInput').setInputFiles(file);

// Measured in the browser: the field's height comes from layout, which jsdom does not do.
test.describe('the message field', () => {
  const height = (page: Page) =>
    page.getByTestId('composerInput').evaluate((field) => field.getBoundingClientRect().height);

  test('grows with long text, up to six lines, then scrolls within itself', async ({ page }) => {
    await openChat(page);
    const composer = page.getByTestId('composerInput');
    const empty = await height(page);

    await composer.fill('We live in a 2BHK on the third floor with a small balcony. No other pets right now.');
    const twoOrThreeLines = await height(page);
    expect(twoOrThreeLines).toBeGreaterThan(empty * 1.5);

    await composer.fill(Array.from({ length: 12 }, (_, line) => `Line ${line + 1}`).join('\n'));
    const capped = await height(page);
    const lineHeight = await composer.evaluate((field) => parseFloat(getComputedStyle(field).lineHeight));
    expect(capped).toBeLessThanOrEqual(lineHeight * 6 + empty - lineHeight + 1);
    expect(capped).toBeGreaterThan(lineHeight * 5);
    expect(await composer.evaluate((field) => field.scrollHeight > field.clientHeight)).toBe(true);
    await expect(composer).toHaveCSS('overflow-y', 'auto');

    // Back to one line once the message is sent and the field clears.
    await page.getByTestId('sendButton').click();
    await expect(composer).toHaveValue('');
    expect(await height(page)).toBe(empty);
  });

  // The buttons stay on the bottom line, next to where the cursor is, as the field grows.
  test('keeps the send button level with the bottom of a grown field', async ({ page }) => {
    await openChat(page);
    await page.getByTestId('composerInput').fill(Array.from({ length: 4 }, () => 'A long line of text').join('\n'));

    const field = (await page.getByTestId('composerInput').boundingBox())!;
    const send = (await page.getByTestId('sendButton').boundingBox())!;
    expect(Math.abs(field.y + field.height - (send.y + send.height))).toBeLessThan(8);
  });
});

test.describe('sending a text message', () => {
  test('the message goes on the wire and appears in the conversation', async ({ page }) => {
    const socket = await openChat(page);

    await page.getByTestId('composerInput').fill('Hello from the widget');
    await page.getByTestId('sendButton').click();

    expect(await socket.waitForPush('new_message')).toEqual({ body: 'Hello from the widget' });
    await expect(page.getByTestId('webChannelMessage')).toHaveCount(1);
    await expect(page.getByTestId('content')).toHaveText('Hello from the widget');
  });

  test('the composer clears, so the next message starts empty', async ({ page }) => {
    await openChat(page);

    await page.getByTestId('composerInput').fill('First');
    await page.getByTestId('sendButton').click();

    await expect(page.getByTestId('composerInput')).toHaveValue('');
  });

  test('Enter sends without reaching for the button, on a keyboard', async ({ page }, testInfo) => {
    test.skip(!!testInfo.project.use.hasTouch, 'on a phone Enter starts a new line instead');
    const socket = await openChat(page);

    await page.getByTestId('composerInput').fill('Sent with the keyboard');
    await page.getByTestId('composerInput').press('Enter');

    expect(await socket.waitForPush('new_message')).toEqual({ body: 'Sent with the keyboard' });
  });

  // A phone keyboard has no Shift+Enter, so its Enter key is the only way to break a line.
  test('Enter starts a new line on a phone, and the send button sends', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use.hasTouch, 'with a keyboard Enter sends');
    const socket = await openChat(page);
    const composer = page.getByTestId('composerInput');

    await composer.fill('First line');
    await composer.press('Enter');
    await composer.pressSequentially('Second line');
    await expect(composer).toHaveValue('First line\nSecond line');

    await page.getByTestId('sendButton').click();
    expect(await socket.waitForPush('new_message')).toEqual({ body: 'First line\nSecond line' });
  });

  test('Shift+Enter starts a new line without sending', async ({ page }) => {
    await openChat(page);
    const composer = page.getByTestId('composerInput');

    await composer.fill('First line');
    await composer.press('Shift+Enter');
    await composer.pressSequentially('Second line');

    await expect(composer).toHaveValue('First line\nSecond line');
    await expect(page.getByTestId('webChannelMessage')).toHaveCount(0);
  });

  // Whitespace would reach the server as an empty message and render as an empty bubble. As in
  // WhatsApp, the mic stands in for Send until there is something to send — but only where the
  // browser can record a format the server accepts. Elsewhere (WebKit on Linux, in CI) there is no
  // mic, and Send shows disabled instead.
  test('an empty or whitespace-only draft offers the mic, or a disabled Send, never a live Send', async ({ page }) => {
    await openChat(page);
    const record = page.getByTestId('recordButton');
    const send = page.getByTestId('sendButton');
    await expect(record.or(send)).toBeVisible();
    const canRecord = await record.isVisible();

    const expectNothingToSend = async () => {
      if (canRecord) {
        await expect(record).toBeVisible();
        await expect(send).toHaveCount(0);
      } else {
        await expect(send).toBeDisabled();
      }
    };

    await expectNothingToSend();
    await page.getByTestId('composerInput').fill('   ');
    await expectNothingToSend();

    await page.getByTestId('composerInput').fill('hi');
    await expect(send).toBeEnabled();
    await expect(record).toHaveCount(0);
  });

  // Without recording support there must be no mic that can never produce a sendable voice note.
  test('a browser that cannot record shows a disabled Send, not a mic', async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-expect-error removing the API, the way a browser without it presents
      delete window.MediaRecorder;
    });
    await openChat(page);

    await expect(page.getByTestId('recordButton')).toHaveCount(0);
    await expect(page.getByTestId('sendButton')).toBeDisabled();

    await page.getByTestId('composerInput').fill('hi');
    await expect(page.getByTestId('sendButton')).toBeEnabled();
  });

  test('history from the join renders, oldest first', async ({ page }) => {
    await openChat(page, {
      messages: [
        { id: 1, body: 'Older', flow: 'outbound', inserted_at: '2026-09-01T10:00:00Z' },
        { id: 2, body: 'Newer', flow: 'inbound', inserted_at: '2026-09-01T10:01:00Z' },
      ],
    });

    await expect(page.getByTestId('content')).toHaveText(['Older', 'Newer']);
  });

  test('a reply pushed by the server arrives without a reload', async ({ page }) => {
    const socket = await openChat(page);

    socket.sendToClient('new_message', {
      id: 99,
      body: 'Thanks for getting in touch',
      flow: 'outbound',
      inserted_at: new Date().toISOString(),
    });

    await expect(page.getByTestId('content')).toHaveText('Thanks for getting in touch');
  });
});

test.describe('the attach menu', () => {
  test('+ slides up a sheet of Camera, Gallery, Document and Location; Escape or a tap behind it closes it', async ({
    page,
  }) => {
    await openChat(page);
    const sheet = page.getByTestId('attachMenu');

    await page.getByTestId('attachButton').click();
    await expect(page.getByRole('menuitem')).toHaveText(['Camera', 'Gallery', 'Document', 'Location']);

    // A bottom sheet: full width of the chat, flush with its bottom edge — measured once it has
    // finished sliding up, since the slide moves it with a transform.
    await sheet.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    const chat = (await page.getByTestId('webChannelChat').boundingBox())!;
    const box = (await sheet.boundingBox())!;
    expect(Math.round(box.width)).toBe(Math.round(chat.width));
    expect(Math.round(box.y + box.height)).toBe(Math.round(chat.y + chat.height));

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId('attachButton')).toBeFocused();

    await page.getByTestId('attachButton').click();
    await page.getByTestId('attachBackdrop').click({ position: { x: 20, y: 120 } });
    await expect(sheet).toHaveCount(0);
  });

  test('Gallery opens the picker for supported photos and videos, and the picture is previewed before sending', async ({
    page,
  }) => {
    await openChat(page);

    await page.getByTestId('attachButton').click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('attach-gallery').click();
    const picker = await chooser;

    const accept = (await picker.element().getAttribute('accept'))!;
    expect(accept).toContain('image/jpeg');
    expect(accept).toContain('video/mp4');
    expect(accept).not.toContain('/*');
    expect(await picker.element().getAttribute('capture')).toBeNull();

    await picker.setFiles(PNG_FIXTURE);
    await expect(page.getByTestId('pendingImagePreview')).toBeVisible();
    await expect(page.getByTestId('composerInput')).toHaveAttribute('placeholder', 'Add a caption');
  });

  // The picker's file-type filter is only a hint: "All files" on Android ignores it.
  test('a file type outside the list is refused when picked, with what can be sent instead', async ({ page }) => {
    await openChat(page);
    const signing = stubUploadUrl(page);

    await attach(page, { name: 'party.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });

    await expect(page.getByTestId('composerError')).toContainText("That file type can't be sent.");
    await expect(page.getByTestId('pendingAttachment')).toHaveCount(0);
    expect(signing.count).toBe(0);
  });

  // `capture` is what makes a phone open its camera rather than the gallery.
  test('Camera asks the browser for the camera', async ({ page }) => {
    await openChat(page);

    await page.getByTestId('attachButton').click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('attach-camera').click();

    expect(await (await chooser).element().getAttribute('capture')).toBe('environment');
  });
});

test.describe('sending an attachment', () => {
  test('the file is signed for, stored, then announced on the channel', async ({ page }) => {
    const socket = await openChat(page);
    const signing = stubUploadUrl(page);
    const storage = stubStoragePut(page);

    const signed = page.waitForRequest((request) => request.url().includes('upload-url'));
    await attach(page, PNG_FIXTURE);
    await expect(page.getByTestId('pendingImagePreview')).toHaveAttribute('alt', PNG_FIXTURE.name);
    await page.getByTestId('sendButton').click();

    // The three values the server validates. content_type also decides the object's extension.
    expect((await signed).postDataJSON()).toMatchObject({ type: 'image', content_type: 'image/png' });
    expect((await signed).postDataJSON().size).toBeGreaterThan(0);

    expect(await socket.waitForPush('new_media_message')).toMatchObject({ type: 'image', url: HOSTED_URL });
    expect(signing.count).toBe(1);
    expect(storage.count).toBe(1);

    await expect(page.getByTestId('mediaContent')).toBeVisible();
    await expect(page.getByTestId('pendingAttachment')).toHaveCount(0);
  });

  test('a file the browser cannot classify is sent as a document', async ({ page }) => {
    const socket = await openChat(page, {});
    stubUploadUrl(page, 'application/pdf');
    stubStoragePut(page);

    await attach(page, PDF_FIXTURE);
    await page.getByTestId('sendButton').click();

    expect(await socket.waitForPush('new_media_message')).toMatchObject({ type: 'document' });
  });

  test('whatever is in the composer rides along as the caption', async ({ page }) => {
    const socket = await openChat(page);
    stubUploadUrl(page);
    stubStoragePut(page);

    await attach(page, PNG_FIXTURE);
    // The placeholder changes to say so, which is the only cue that the field means something else now.
    await expect(page.getByTestId('composerInput')).toHaveAttribute('placeholder', 'Add a caption');
    await page.getByTestId('composerInput').fill('Here is the form');
    await page.getByTestId('sendButton').click();

    expect(await socket.waitForPush('new_media_message')).toMatchObject({ caption: 'Here is the form' });
  });

  test('an attachment can be dropped before it is sent', async ({ page }) => {
    await openChat(page);

    await attach(page, PNG_FIXTURE);
    await page.getByTestId('removeAttachmentButton').click();

    await expect(page.getByTestId('pendingAttachment')).toHaveCount(0);
    await expect(page.getByTestId('composerInput')).toHaveAttribute('placeholder', 'Type a message');
  });
});

test.describe('when an attachment fails', () => {
  // A bubble for a file that never arrived would tell the user they had said something they had not.
  test('nothing is added to the conversation', async ({ page }) => {
    await openChat(page);
    await stubUploadUrlError(page, 'signing_failed', 500);

    await attach(page, PNG_FIXTURE);
    await page.getByTestId('sendButton').click();

    await expect(page.getByTestId('composerError')).toBeVisible();
    await expect(page.getByTestId('webChannelMessage')).toHaveCount(0);
    await expect(page.getByTestId('mediaContent')).toHaveCount(0);
  });

  test('the file stays attached, so a retry is one tap and not a re-pick', async ({ page }) => {
    await openChat(page);
    await stubUploadUrlError(page, 'signing_failed', 500);

    await attach(page, PNG_FIXTURE);
    await page.getByTestId('sendButton').click();
    await expect(page.getByTestId('composerError')).toBeVisible();

    await expect(page.getByTestId('pendingImagePreview')).toHaveAttribute('alt', PNG_FIXTURE.name);
    await expect(page.getByTestId('sendButton')).toHaveAttribute('aria-label', 'retry sending');

    const signing = stubUploadUrl(page);
    stubStoragePut(page);
    await page.getByTestId('sendButton').click();

    await expect(page.getByTestId('mediaContent')).toBeVisible();
    expect(signing.count).toBe(1);
  });

  // Keyed on the server's code rather than its prose, so this is the widget's own copy.
  test("the server's reason reaches the user in the widget's words", async ({ page }) => {
    await openChat(page);
    await stubUploadUrlError(page, 'file_too_large');

    await attach(page, PNG_FIXTURE);
    await page.getByTestId('sendButton').click();

    await expect(page.getByTestId('composerError')).toHaveText(
      'That file is too large to send. Please choose a smaller one.',
    );
  });

  test('a rejection from Google is reported without leaking its XML', async ({ page }) => {
    await openChat(page);
    stubUploadUrl(page);
    await stubStoragePutFailure(page);

    await attach(page, PNG_FIXTURE);
    await page.getByTestId('sendButton').click();

    await expect(page.getByTestId('composerError')).toHaveText('Upload failed. Please try again.');
  });

  // The bytes are already stored; re-uploading them would spend the user's data twice.
  test('a retry after the channel refused it does not upload the bytes again', async ({ page }) => {
    const socket = await openChat(page, { failOn: ['new_media_message'] });
    const signing = stubUploadUrl(page);
    const storage = stubStoragePut(page);

    await attach(page, PNG_FIXTURE);
    await page.getByTestId('sendButton').click();
    await expect(page.getByTestId('composerError')).toBeVisible();

    socket.recover('new_media_message');
    await page.getByTestId('sendButton').click();

    await expect(page.getByTestId('mediaContent')).toBeVisible();
    expect(socket.payloadsFor('new_media_message')).toHaveLength(2);
    expect(signing.count).toBe(1);
    expect(storage.count).toBe(1);
  });
});

test.describe('the organisation details', () => {
  // Reaching them should not require finding the menu first: the name and mark in the header are
  // the obvious thing to press, and on WhatsApp they are what opens contact info.
  test('the header opens them, and closing comes back to the chat', async ({ page }) => {
    await openChat(page);

    await page.getByTestId('orgDetailsButton').click();

    await expect(page.getByTestId('webChannelAbout')).toBeVisible();
    await expect(page.getByTestId('about-address')).toContainText(DARK_ACCENT_ORG.about.address!);

    await page.getByTestId('aboutBack').click();

    await expect(page.getByTestId('webChannelChat')).toBeVisible();
    // Whichever way they were opened, closing lands on the chat with nothing over it.
    await expect(page.getByTestId('chatMenu')).toHaveCount(0);
  });

  test('the menu opens them too, and leaves nothing behind on the way back', async ({ page }) => {
    await openChat(page);

    await page.getByTestId('chatMenuButton').click();
    await page.getByTestId('menuAbout').click();
    await expect(page.getByTestId('webChannelAbout')).toBeVisible();

    await page.getByTestId('aboutBack').click();

    await expect(page.getByTestId('webChannelChat')).toBeVisible();
    await expect(page.getByTestId('chatMenu')).toHaveCount(0);
  });
});

test.describe('sharing a location', () => {
  test.use({ geolocation: { latitude: 12.9716, longitude: 77.5946 }, permissions: ['geolocation'] });

  test('the coordinates go to the server and a map link appears', async ({ page }) => {
    const socket = await openChat(page);

    await page.getByTestId('attachButton').click();
    await page.getByTestId('attach-location').click();

    expect(await socket.waitForPush('new_location_message')).toEqual({
      latitude: 12.9716,
      longitude: 77.5946,
    });
    await expect(page.getByTestId('locationContent')).toHaveAttribute(
      'href',
      'https://www.google.com/maps?q=12.9716,77.5946',
    );
  });
});

test.describe('when location is refused', () => {
  test.use({ permissions: [] });

  test('the refusal is explained and nothing is sent', async ({ page }) => {
    const socket = await openChat(page);

    await page.getByTestId('attachButton').click();
    await page.getByTestId('attach-location').click();

    await expect(page.getByTestId('composerError')).toBeVisible();
    expect(socket.payloadsFor('new_location_message')).toHaveLength(0);
  });
});
