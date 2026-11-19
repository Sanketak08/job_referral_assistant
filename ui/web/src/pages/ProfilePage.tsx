import type { ProfileFile } from '@jobhunt/shared';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.ts';
import { Icon } from '../components/Icon.tsx';

/** A plain editor for input/profile.yaml, the file every skill reads. */
export function ProfilePage() {
  const [file, setFile] = useState<ProfileFile | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [loads, setLoads] = useState(0);
  const load = (): void => setLoads((n) => n + 1);

  useEffect(() => {
    api
      .profile()
      .then((f) => {
        setFile(f);
        setText(f.text);
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [loads]);

  const dirty = file !== null && text !== file.text;

  const save = (): void => {
    if (!file) return;
    setSaving(true);
    setError(null);
    api
      .saveProfile(text, file.modifiedAt)
      .then((f) => {
        setFile(f);
        setText(f.text);
        setSavedAt(Date.now());
      })
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setSaving(false));
  };

  return (
    <div className="card page-card profile-page">
      <div className="card-toolbar">
        <span className={dirty ? 'pill pill-stopped' : 'pill pill-done'}>
          <span className="status-dot" />
          {dirty ? 'Unsaved changes' : savedAt ? 'Saved' : 'Up to date'}
        </span>
        <code className="muted profile-path">input/profile.yaml</code>
        <div className="toolbar-actions">
          <button className="btn" onClick={load} disabled={saving}>
            <Icon name="history" size={15} /> {dirty ? 'Discard changes' : 'Reload'}
          </button>
          <button className="btn btn-dark" onClick={save} disabled={!dirty || saving}>
            <Icon name="save" size={15} /> Save
          </button>
        </div>
      </div>
      <p className="muted profile-note">
        Every skill reads this file at the start of a run. Saving keeps the previous version as{' '}
        <code>input/profile.yaml.bak</code>. You can also ask Claude in any tab to change it, for
        example "Add Rust to my skills in profile.yaml".
      </p>
      {error && (
        <div className="alert">
          <Icon name="alert" size={16} /> {error}
        </div>
      )}
      <textarea
        className="input mono profile-editor"
        spellCheck={false}
        wrap="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            if (dirty) save();
          }
        }}
        disabled={file === null}
        aria-label="profile.yaml"
      />
    </div>
  );
}
