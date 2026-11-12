# Note Summarizer

Obsidian plugin (desktop only) that summarizes the current note with AWS Bedrock, using
[obsidian-bedrock-client](https://github.com/promiseofcake/obsidian-bedrock-client) and AWS CLI credentials.
No credentials are stored by the plugin.

## Commands

- **Summarize note (append summary)**: adds a `## Summary` section at the end of the note.
- **Summarize note (replace note with summary)**: replaces the note body with the summary and keeps the frontmatter. A confirm dialog comes first; undo with Cmd/Ctrl+Z or file recovery.

Both commands are available when a Markdown note is open. Frontmatter is never sent to the model.

### Running it again

Appending again replaces the existing `## <heading>` section instead of adding a second one. The section runs up to the next H1 or H2 heading. Text after the summary with no heading after it counts as part of the summary and is replaced too.

## Install (BRAT)

1. Install the BRAT plugin and enable it.
2. In BRAT, choose **Add beta plugin** and enter `promiseofcake/obsidian-note-summarizer`.
3. Enable Note Summarizer.

## Prerequisites

- AWS CLI v2.
- The `default` profile in `~/.aws/config`, signed in with `aws sso login --profile default`.

When your session expires, the plugin shows a notice with a **Copy command** button for the login command.

## Settings

| Setting | Default |
|---|---|
| AWS CLI path | auto-detect |
| AWS profile | `default` |
| Region | `us-east-1` |
| Model ID | `us.anthropic.claude-sonnet-5` (provisional: availability is still being confirmed, so change it if the request is rejected) |
| Max output tokens | 4096 |
| Summary heading | `Summary` |
| System prompt | neutral meeting-notes summary, editable, with Reset to default |

Use **Test connection** to send a tiny request with these settings.

## Privacy

Note content is sent to Bedrock in the AWS account behind the configured profile. Prompts and model output are never logged.
