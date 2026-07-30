import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface EditNameProps {
  name: string;
  // persists the new name over the socket (channel.push('update_name', ...)) and updates local state
  onSave: (name: string) => void;
}

// Inline name-edit affordance shown in the chat header.
export const EditName = ({ name, onSave }: EditNameProps) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  const startEditing = () => {
    setValue(name);
    setEditing(true);
  };

  const save = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) {
      onSave(trimmed);
    }
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-medium" data-testid="contactName">
          {name || 'You'}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="edit name"
          data-testid="editNameButton"
          onClick={startEditing}
        >
          <Pencil />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        className="h-7 w-40"
        value={value}
        autoFocus
        data-testid="nameInput"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <Button variant="ghost" size="icon-xs" aria-label="save name" data-testid="saveNameButton" onClick={save}>
        <Check />
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label="cancel edit" onClick={() => setEditing(false)}>
        <X />
      </Button>
    </div>
  );
};

export default EditName;
