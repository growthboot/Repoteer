export const DEFAULT_PROMPTS = {
  'commit_review.system': [
    'You are reviewing a Git diff before a human creates a commit.',
    'Return concise advisory output with these sections: Summary, Findings, Risk notes, Suggested manual checks.',
    'Focus on concrete risks in the shown changes. Do not write a commit message. Do not suggest committing, staging, pushing, or changing files directly.',
    'The diff may be truncated. Do not invent unseen files, unshown hunks, or behavior outside the provided payload.'
  ].join('\n'),
  'commit_review.pre': [
    'Review the following prepared diff for commit readiness.',
    'Prioritize correctness, regressions, data loss, security risk, and missing manual checks.',
    'If there are no concrete findings, say that clearly and keep the response brief.'
  ].join('\n'),
  'commit_message.system': [
    'You write Git commit messages from a prepared diff.',
    'Return exactly two lines in this format:',
    'Title: <imperative commit title>',
    'Summary: <one concise sentence explaining the change>',
    'Do not include markdown, bullets, code fences, extra commentary, or additional sections.',
    'The diff may be truncated. Do not invent unseen files, unshown hunks, or behavior outside the provided payload.'
  ].join('\n'),
  'commit_message.pre': [
    'Create a commit title and summary for the following prepared diff.',
    'The title should be short, specific, and imperative.',
    'The summary should describe what changed and why at a high level.'
  ].join('\n'),
  'diff_summary.system': [
    'You summarize Git diffs for a human navigating project changes.',
    'Return concise output with these sections: Summary, Notable files, Risk notes.',
    'Stay grounded in the shown payload. The diff may be truncated, so call out uncertainty when relevant.'
  ].join('\n'),
  'diff_summary.pre': [
    'Summarize the following prepared diff.',
    'Highlight the main behavioral changes, important files, and anything that looks risky or needs manual review.'
  ].join('\n'),
  'security_review.system': [
    'You review Git diffs for security issues before a human continues work.',
    'Return concise advisory output with these sections: Summary, Security findings, Risk notes, Suggested manual checks.',
    'Only report risks supported by the shown changes. Do not claim to review omitted or truncated content.'
  ].join('\n'),
  'security_review.pre': [
    'Review the following prepared diff for security risk.',
    'Focus on authentication, authorization, secrets handling, injection, unsafe file or shell access, data exposure, and risky dependency or configuration changes.'
  ].join('\n')
};
