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
  // The banner clears only once the join is acknowledged; without waiting, a send races the channel.
  await expect(page.getByTestId('connectionStatus')).toHaveCount(0);

  return socket;
};

const attach = (page: Page, file: typeof PNG_FIXTURE) => page.getByTestId('fileInput').setInputFiles(file);

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

  test('Enter sends without reaching for the button', async ({ page }) => {
    const socket = await openChat(page);

    await page.getByTestId('composerInput').fill('Sent with the keyboard');
    await page.getByTestId('composerInput').press('Enter');

    expect(await socket.waitForPush('new_message')).toEqual({ body: 'Sent with the keyboard' });
  });

  // Whitespace would reach the server as an empty message and render as an empty bubble.
  test('an empty or whitespace-only draft cannot be sent', async ({ page }) => {
    await openChat(page);

    await expect(page.getByTestId('sendButton')).toBeDisabled();
    await page.getByTestId('composerInput').fill('   ');
    await expect(page.getByTestId('sendButton')).toBeDisabled();
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

test.describe('sending an attachment', () => {
  test('the file is signed for, stored, then announced on the channel', async ({ page }) => {
    const socket = await openChat(page);
    const signing = stubUploadUrl(page);
    const storage = stubStoragePut(page);

    const signed = page.waitForRequest((request) => request.url().includes('upload-url'));
    await attach(page, PNG_FIXTURE);
    await expect(page.getByTestId('pendingAttachmentName')).toHaveText(PNG_FIXTURE.name);
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

    await expect(page.getByTestId('pendingAttachmentName')).toHaveText(PNG_FIXTURE.name);
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

test.describe('sharing a location', () => {
  test.use({ geolocation: { latitude: 12.9716, longitude: 77.5946 }, permissions: ['geolocation'] });

  test('the coordinates go to the server and a map link appears', async ({ page }) => {
    const socket = await openChat(page);

    await page.getByTestId('locationButton').click();

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

    await page.getByTestId('locationButton').click();

    await expect(page.getByTestId('composerError')).toBeVisible();
    expect(socket.payloadsFor('new_location_message')).toHaveLength(0);
  });
});
