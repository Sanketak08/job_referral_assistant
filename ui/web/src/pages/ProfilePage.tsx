import type { ProfileFile } from '@jobhunt/shared';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client.ts';
import { EditWithClaude, type EditorState } from '../components/EditWithClaude.tsx';
import { Icon } from '../components/Icon.tsx';
import { EDIT_EXAMPLES } from '../tabs/editExamples.ts';

interface Props {
  /** Increases when profile.yaml changes on disk (saved here or edited by Claude). */
  version: number;
  editor: EditorState;
}

/** input/profile.yaml, the file every skill reads: edit it by hand or ask Claude to. */
export function ProfilePage({ version, editor }: Props) {
  const [file, setFile] = useState<ProfileFile | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [askOpen, setAskOpen] = useState(false);
  /** The file changed on disk while there were unsaved edits here. */
  const [diskChanged, setDiskChanged] = useState(false);

  const [loads, setLoads] = useState(0);
  const load = (): void => setLoads((n) => n + 1);

  const dirty = file !== null && text !== file.text;
  const dirtyRef = useRef(dirty);
  const loadsSeen = useRef(loads);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Loads on open, on Reload, and whenever the file changes on disk. A change on disk never
  // overwrites unsaved edits: it shows a warning, and saving then reports the conflict.
  useEffect(() => {
    const explicit = loads !== loadsSeen.current;
    loadsSeen.current = loads;
    api
      .profile()
      .then((f) => {
        if (explicit || !dirtyRef.current) {
          setFile(f);
          setText(f.text);
          setDiskChanged(false);
        } else {
          setDiskChanged(true);
        }
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [loads, version]);

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
          <button className="btn btn-dark" onClick={() => setAskOpen(true)}>
            <Icon name="sparkle" size={15} /> Ask Claude
          </button>
          <button className="btn" onClick={load} disabled={saving}>
            <Icon name="history" size={15} />{' '}
            <span className="btn-label">{dirty ? 'Discard changes' : 'Reload'}</span>
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
            <Icon name="save" size={15} /> Save
          </button>
        </div>
      </div>
      <p className="muted profile-note">
        Every skill reads this file at the start of a run. Edit it here, or press{' '}
        <strong>Ask Claude</strong> and describe the change. Either way the previous version is kept
        as <code>input/profile.yaml.bak</code>.
      </p>
      {diskChanged && (
        <div className="alert alert-attn">
          <Icon name="alert" size={16} /> profile.yaml changed on disk while you were editing.
          Discard your changes to see the new version.
        </div>
      )}
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
      {askOpen && (
        <EditWithClaude
          title="Ask Claude to edit your profile"
          intro={
            <p>
              Describe what to change in <code>input/profile.yaml</code>. Claude edits only that,
              keeps the YAML valid, asks if something is unclear, and never invents facts about you.
              The editor below refreshes when it is done.
            </p>
          }
          target="profile"
          examples={EDIT_EXAMPLES.profile}
          editor={editor}
          onClose={() => setAskOpen(false)}
        />
      )}
    </div>
  );
}
