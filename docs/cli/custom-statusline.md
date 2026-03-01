# Custom Status Line

The Gemini CLI allows you to replace the default footer with a fully
customizable status line, similar to how other modern tools work. This gives you
complete control over what information is displayed, how it is formatted, and
which colors are used.

## Enabling the Custom Status Line

To enable the custom status line, you need to configure a shell command in your
`settings.json` file. You can edit this file by running `/settings` in the CLI.

Add the `ui.statusLine.command` property:

```json
{
  "ui": {
    "statusLine": {
      "command": "/path/to/your/statusline.sh"
    }
  }
}
```

When this command is configured, the Gemini CLI will periodically execute it
(debounced by 300ms on every UI state change) and use its standard output
(`stdout`) to render the footer.

## How It Works

1. **State Injection:** The CLI pipes the current session state as a JSON string
   to the standard input (`stdin`) of your configured command.
2. **Command Execution:** Your command processes this JSON data, formats it, and
   outputs a string.
3. **Rendering:** The CLI captures the output and renders it directly at the
   bottom of the terminal. It fully supports ANSI escape codes for colors and
   styling.

### The JSON State Payload

The JSON object sent to `stdin` has the following structure:

```json
{
  "model": {
    "id": "gemini-2.5-pro",
    "display_name": "gemini-2.5-pro"
  },
  "workspace": {
    "current_dir": "/path/to/your/project"
  },
  "git": {
    "branch": "main"
  },
  "usage": {
    "prompt_tokens": 12345
  }
}
```

_(Note: Additional fields may be added in future versions.)_

## Example: Using `jq`

If you have `jq` installed, you can create a simple status line directly in your
settings without needing a separate script file:

```json
{
  "ui": {
    "statusLine": {
      "command": "jq -r '"\u001b[36m" + .model.display_name + "\u001b[0m | Tokens: " + (.usage.prompt_tokens | tostring)'"
    }
  }
}
```

## Example: Custom Shell Script

For more complex logic, create an executable shell script (e.g.,
`~/.gemini/statusline.sh`) and make it executable
(`chmod +x ~/.gemini/statusline.sh`).

```bash
#!/bin/bash

# Read the JSON from stdin
json=$(cat)

# Extract values using jq
model=$(echo "$json" | jq -r '.model.display_name')
branch=$(echo "$json" | jq -r '.git.branch // "none"')
tokens=$(echo "$json" | jq -r '.usage.prompt_tokens // 0')

# Define some ANSI colors
CYAN='\033[36m'
GREEN='\033[32m'
RESET='\033[0m'

# Output the formatted status line
echo -e "${CYAN}🤖 ${model}${RESET} | ${GREEN}🌿 ${branch}${RESET} | 🪙 ${tokens}"
```

Then in your `settings.json`:

```json
{
  "ui": {
    "statusLine": {
      "command": "~/.gemini/statusline.sh"
    }
  }
}
```

## Troubleshooting

- **Empty Footer:** If your command returns an empty string or fails, the footer
  will simply display nothing or "Loading status...". Check your script for
  errors.
- **Performance:** Ensure your script executes quickly (ideally under 50ms).
  Since it is called frequently during typing and state changes, a slow script
  can cause the CLI UI to feel sluggish.
- **Errors:** If your command exits with a non-zero status code, errors will be
  printed to the development console (or visible in the DevTools).
