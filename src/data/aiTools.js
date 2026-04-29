export const AI_TOOL_DEFINITIONS = [
  {
    id: 'commit_review',
    title: 'Commit review',
    description: 'Review changed code and return advisory findings before a commit.',
    systemPromptId: 'commit_review.system',
    prePromptId: 'commit_review.pre',
    payloadBuilderId: 'git_diff',
    internalMessages: [
      'AI output is advisory and must not commit, stage, push, or modify files.',
      'The diff payload may be truncated. Do not invent unseen files or hunks.'
    ],
    outputMode: 'review'
  },
  {
    id: 'commit_message',
    title: 'Commit message',
    description: 'Generate a commit title and summary from the prepared diff.',
    systemPromptId: 'commit_message.system',
    prePromptId: 'commit_message.pre',
    payloadBuilderId: 'git_diff',
    internalMessages: [
      'Return only a commit title and summary for a human to review.',
      'Do not tell the user to stage, commit, push, or modify files.'
    ],
    outputMode: 'commit_message'
  },
  {
    id: 'diff_summary',
    title: 'Diff summary',
    description: 'Summarize the prepared diff for quick human review.',
    systemPromptId: 'diff_summary.system',
    prePromptId: 'diff_summary.pre',
    payloadBuilderId: 'git_diff',
    internalMessages: [
      'Summaries should stay grounded in the provided diff payload.',
      'The diff payload may be truncated. Say when uncertainty comes from missing context.'
    ],
    outputMode: 'summary'
  },
  {
    id: 'security_review',
    title: 'Security review',
    description: 'Review changed code for security risks and manual checks.',
    systemPromptId: 'security_review.system',
    prePromptId: 'security_review.pre',
    payloadBuilderId: 'git_diff',
    internalMessages: [
      'Security output is advisory and must stay tied to shown changes.',
      'The diff payload may be truncated. Do not claim coverage for omitted content.'
    ],
    outputMode: 'security_review'
  }
];
