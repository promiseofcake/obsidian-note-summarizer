# Note Summarizer

Obsidian plugin (desktop only) that summarizes the current note with AWS Bedrock, using
AWS CLI credentials.
No credentials are stored by the plugin.

## Commands

- **Summarize note (append summary)**: adds a horizontal rule and a `## Summary` section at the end of the note.
- **Summarize note (replace note with summary)**: replaces the note body with the summary and keeps the frontmatter. A confirm dialog comes first; undo with Cmd/Ctrl+Z or file recovery.

Both commands are available when a Markdown note is open. Frontmatter is never sent to the model.

The summary goes at the bottom, below a rule:

```markdown
…your notes

---

## Summary

…summary…
```

### Running it again

Appending again replaces the summary block (from its `---` to the end of the note) instead of adding a second one. The old summary is not sent to the model. Anything typed below the summary is part of the block and is replaced too; add notes above the rule.

Other horizontal rules, and a hand-written `## Summary` heading with no rule directly above it, are left alone.

### Timeouts

A Bedrock request that gets no response within 120 seconds fails with "Summarize failed: Bedrock request timed out after 120s", and the note is left unchanged. Timeouts are not retried.

### Edits during the call

In replace mode, if the note body changes while the model is working, nothing is replaced and the plugin shows "Note changed while summarizing; nothing was replaced. Run again, or use append." Append mode is unaffected: it applies to the current content.

## Install (BRAT)

1. Install the BRAT plugin and enable it.
2. In BRAT, choose **Add beta plugin** and enter `promiseofcake/obsidian-note-summarizer`.
3. Enable Note Summarizer.

## Prerequisites

- AWS CLI v2.
- An AWS CLI profile with Bedrock access in `~/.aws/config`, signed in (for SSO, `aws sso login --profile <name>`). Set its name under **AWS profile** in settings; the default is `default`.

When your session expires, the plugin shows a notice with a **Copy command** button for the login command.

## Settings

| Setting | Default |
|---|---|
| AWS CLI path | auto-detect |
| AWS profile | `default` |
| Region | `us-east-1` |
| Model ID | `us.anthropic.claude-sonnet-5-5` |
| Max output tokens | 4096 |
| Summary heading | `Summary` |
| System prompt | neutral meeting-notes summary, editable, with Reset to default |

Use **Test connection** to send a tiny request with these settings.

## Privacy

Note content is sent to Bedrock in the AWS account behind the configured profile. Prompts and model output are never logged.
