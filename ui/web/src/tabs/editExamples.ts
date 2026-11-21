import type { EditRequest } from '@jobhunt/shared';

/** Starting points shown in each "Edit with Claude" panel. */
export const EDIT_EXAMPLES: Record<EditRequest['target'], string[]> = {
  profile: [
    'Add Rust and Go to my skills',
    'My notice period is now 30 days',
    'Add Munich to my preferred locations',
  ],
  search: [
    'Also search Amsterdam and Berlin',
    'Skip jobs that require German',
    'Only keep jobs with a match score of 75 or more',
  ],
  apply: [
    'Use the Data Engineer resume for data roles',
    'Leave optional diversity questions blank',
    'Ask me before uploading a cover letter',
  ],
  referral: [
    'Find 4 contacts per company instead of 5 or 6',
    'Mention my Kafka experience in every email',
    'Skip companies where I already contacted someone',
  ],
  editor: [],
};
