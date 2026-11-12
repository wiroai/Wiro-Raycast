<div align="center">

<img src="https://raw.githubusercontent.com/wiroai/Wiro-Raycast/main/.github/assets/wiro-logo.png" alt="Wiro AI" width="240">

# Wiro AI for Raycast

Generate images, video, speech and music, edit images, transcribe audio, chat with LLMs, run workflows and agents, and search 1,000+ AI models on Wiro AI from Raycast.

[![Raycast extension](https://img.shields.io/badge/Raycast-extension-111111?style=for-the-badge&color=111111)](https://www.raycast.com/) [![macOS](https://img.shields.io/badge/platform-macOS-111111?style=for-the-badge&color=111111)](#install) [![CI](https://img.shields.io/github/actions/workflow/status/wiroai/Wiro-Raycast/ci.yml?branch=main&style=for-the-badge&label=CI&color=111111)](https://github.com/wiroai/Wiro-Raycast/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-111111?style=for-the-badge&color=111111)](./LICENSE)

[Website](https://wiro.ai) · [Models](https://wiro.ai/models) · [Docs](https://wiro.ai/docs) · [Dashboard](https://wiro.ai/panel)

<img src="https://wiro.ai/images/koala/accent-heavy-koala.png" alt="Wiro AI koala mascot" width="60" />

</div>

This [Raycast](https://www.raycast.com) extension puts the [Wiro AI](https://wiro.ai) API in your launcher. Each command lists the models of its category straight from the Wiro AI catalog, builds its form from the chosen model's own inputs and shows the price for your settings before you run it. Results come back into Raycast, where you can copy them, save them to Downloads, show them in Finder or preview them with Quick Look. New models show up without an update to the extension.

## Commands

| Command | What it does |
| --- | --- |
| **Generate Image** | Pick a text-to-image model, write a prompt and set the model's options, such as resolution, ratio or quality. |
| **Edit Image** | Starts from the image selected in Finder or an image file on the clipboard. Edit it with a prompt, upscale it, remove its background or restore an old photo, each with the models of that category. |
| **Generate Video** | Make a video from a prompt or from an image. Raycast follows the task while the model works, and you can cancel it. |
| **Generate Speech** | Reads the text selected in the frontmost app aloud, with the text-to-speech model and the voice you pick. |
| **Generate Music** | Make music or a song from a prompt, with lyrics when the model takes them. |
| **Transcribe Audio** | Turns an audio file, such as the one selected in Finder, into text you can copy, paste or save. |
| **Ask AI** | Chat with LLMs from OpenAI, Anthropic, Google, DeepSeek, xAI, Qwen and others through the Wiro AI LLM gateway. Pick the model in the dropdown and ask follow-up questions in the same conversation. Type a question after the command name to start a new conversation right away. |
| **Search Models** | Search the catalog by name, owner or task and filter it by category. Each model shows its cover, description, typical run time and starting price, and opens in the form that fits it. |
| **Run Any Model** | Search the whole catalog and run any model with a form built from its inputs: text, choices, numbers, switches and file pickers. |
| **Run Workflow** | Lists your Wiro AI workflows and runs one with its inputs. Files you pick are uploaded for the run, and every output of the workflow comes back as its own result. |
| **Message Agent** | Lists the agents deployed in your workspace with their status and credits, and lets you message a running one and read its replies. |
| **Task History** | Your recent tasks with their status, prompt, run time and cost. Open any of them to get its results again. |
| **Wallet Balance** | Shows your balance in the menu bar, with links to add funds, your task history and the dashboard. |

Settings the catalog shows by default, settings that change the price and key settings such as voice or duration come first in each form. The rest wait behind **Show advanced settings**, and required settings you leave there are sent with the model's default.

## Results

Every output is a row with a preview beside it.

| Output | Actions |
| --- | --- |
| Image | Copy Image (`↵`), Save to Downloads (`⌘S`), Show in Finder (`⌘⇧F`), Quick Look (`⌘Y`), Open (`⌘O`), Open in Browser, Copy URL (`⌘⇧C`) |
| Video and audio | Open (`↵`), Quick Look (`⌘Y`), Save to Downloads (`⌘S`), Show in Finder (`⌘⇧F`), Copy Video or Copy Audio (`⌘⇧V`), Open in Browser, Copy URL (`⌘⇧C`) |
| Text | Copy Text (`↵`), Paste Text (`⌘⇧↵`), Save to Downloads (`⌘S`), Show in Finder (`⌘⇧F`) |

While a task runs you can open your task history on wiro.ai or cancel the task (`⌃X`). Closing Raycast does not stop a task; its result is in Task History.

## Install

To run the extension from this repository:

1. Install [Raycast](https://www.raycast.com) and [Node.js](https://nodejs.org) 22.
2. Clone the repository and install its dependencies:

   ```bash
   git clone https://github.com/wiroai/Wiro-Raycast.git
   cd Wiro-Raycast
   npm install
   ```

3. Run `npm run dev`. Raycast loads the extension, and its commands stay in Raycast after you stop the command with `Ctrl+C`.

## Set up

Raycast asks for your API key the first time you open one of the commands.

1. Sign up at [wiro.ai](https://wiro.ai) and create a project at [wiro.ai/panel/project/new](https://wiro.ai/panel/project/new). Your projects and their keys are listed at [wiro.ai/panel/project](https://wiro.ai/panel/project).
2. Paste the project's API key into **API Key**.
3. If you created the project with signature-based authentication, paste its API secret into **API Secret** as well. Leave it empty for an **API Key Only** project.

| Preference | Required | Description |
| --- | --- | --- |
| API Key | Yes | API key of your Wiro AI project |
| API Secret | For signature-based projects | API secret of the same project |
| Save Folder | No | Where Save puts files. Your Downloads folder is used when it is empty |

To change them later, open Raycast Settings, then **Extensions → Wiro AI**. Edit Image and Transcribe Audio read the Finder selection, and Generate Speech reads the selected text; macOS may ask you to let Raycast do that the first time.

## How it works

- Each command maps to catalog categories, never to fixed models: Edit Image uses `image-editing`, `upscale`, `background-removal` and `restoration`, Generate Music uses `text-to-music` and `text-to-song`, Transcribe Audio uses `speech-to-text`, and so on. The forms read the models with `POST /Tool/List` and a model's inputs and price list with `POST /Tool/Detail`.
- File inputs are found by their type and name, so a model that calls its image `inputImage` and one that calls it `firstFrame` both get the file you picked. Models that cannot take that kind of file are left out of the picker.
- A run is `POST /Run/{owner}/{model}` on `https://api.wiro.ai/v1`: JSON for text-only runs, multipart form data with your files otherwise ([Run a Model](https://wiro.ai/docs/run-a-model)). The extension polls `POST /Task/Detail` until the task reaches `task_postprocess_end` or `task_cancel`, and a finished task failed only when its `pexit` is set and is not `"0"` ([Tasks](https://wiro.ai/docs/tasks)).
- The price line follows how Wiro bills: the price list row that matches your settings, per run, per output, per character, per second of audio or video, or by run time when there is no list. A discount on your account shows on the same line.
- Workflows run with `POST /Workflow/Run` and are followed with `POST /Workflow/RunDetail`; files you pick for a workflow are uploaded with `POST /File/Upload` first. Agents are messaged with `POST /UserAgent/Message/Send` and read with `POST /UserAgent/Message/Detail`.
- Ask AI sends the conversation to `POST /v1/chat/completions` on the OpenAI-compatible gateway at `https://llm.wiro.ai/v1` ([LLM gateway](https://wiro.ai/docs/completions-api)).
- Signature-based projects sign every Run API request with `x-nonce` and `x-signature`, an HMAC-SHA256 of the secret and the nonce keyed with the API key; the gateway takes `key:secret` as its Bearer token ([Authentication](https://wiro.ai/docs/authentication)). Your key and secret stay in Raycast's encrypted preferences and go only to `api.wiro.ai` and `llm.wiro.ai`.

## Pricing

Searching models and reading their settings is free. Model runs, workflow steps and chat messages are charged to your project's wallet at each model's price on wiro.ai, and failed tasks are not charged. Each form shows the price for your settings before you run it, and each result shows what the task cost. Messages to your own agents use the agent's credits.

## Development

```bash
npm install
npm run dev     # load the extension in Raycast in development mode
npm run lint    # ESLint, Prettier and Raycast's manifest checks
npm test        # unit tests
npm run build   # distribution build
```

The unit tests cover request signing, schema reading (prompts, file inputs, input fit, settings and defaults), the price engine, task outputs, workflow inputs and outputs, agent replies and stream parsing, without calling the API.

## More from Wiro AI

| Repository | What it is |
| --- | --- |
| [Wiro-MCP](https://github.com/wiroai/Wiro-MCP) | Official MCP server for Wiro AI, [`@wiro-ai/wiro-mcp` on npm](https://www.npmjs.com/package/@wiro-ai/wiro-mcp) |
| [Wiro-LLM](https://github.com/wiroai/Wiro-LLM) | Vercel AI SDK provider for chat, images, speech, transcription and video, [`@wiro-ai/wiro-llm` on npm](https://www.npmjs.com/package/@wiro-ai/wiro-llm) |
| [Wiro-Plugin](https://github.com/wiroai/Wiro-Plugin) | Wiro AI plugin for Cursor, Claude Code, Gemini CLI, Devin, Antigravity and Kiro |
| [Wiro-Chromium-Extension](https://github.com/wiroai/Wiro-Chromium-Extension) | Wiro AI extension for Chrome, Edge, Opera and Brave |
| [Wiro-Firefox-Extension](https://github.com/wiroai/Wiro-Firefox-Extension) | Wiro AI add-on for Firefox |
| [Wiro-Safari-Extension](https://github.com/wiroai/Wiro-Safari-Extension) | Wiro AI extension for Safari on the Mac |
| [Swift-QuickStart](https://github.com/wiroai/Swift-QuickStart) | WiroKit, the Wiro AI SDK for iOS |
| [Kotlin-QuickStart](https://github.com/wiroai/Kotlin-QuickStart) | WiroKit, the Wiro AI SDK for Android |
| [Dart-QuickStart](https://github.com/wiroai/Dart-QuickStart) | Wiro AI SDK for Dart and Flutter, [`wiro` on pub.dev](https://pub.dev/packages/wiro) |
| [ReactNative-QuickStart](https://github.com/wiroai/ReactNative-QuickStart) | Wiro AI SDK for React Native and Expo, [`@wiro-ai/wiro-react-native` on npm](https://www.npmjs.com/package/@wiro-ai/wiro-react-native) |
| [Swift-Realtime](https://github.com/wiroai/Swift-Realtime) | Realtime voice AI example for iOS |
| [Kotlin-Realtime](https://github.com/wiroai/Kotlin-Realtime) | Realtime voice AI example for Android |
| [Dart-Realtime](https://github.com/wiroai/Dart-Realtime) | Realtime voice AI example for Flutter |
| [ReactNative-Realtime](https://github.com/wiroai/ReactNative-Realtime) | Realtime voice AI example for React Native |
| [n8n-nodes-wiroai](https://github.com/wiroai/n8n-nodes-wiroai) | Wiro AI nodes for n8n, [`@wiro-ai/n8n-nodes-wiroai` on npm](https://www.npmjs.com/package/@wiro-ai/n8n-nodes-wiroai) |
| [Wiro-Dify-Plugin](https://github.com/wiroai/Wiro-Dify-Plugin) | Wiro AI plugins for Dify: the LLM gateway as a model provider, plus image, video, speech and music tools |
| [Wiro-ComfyUI](https://github.com/wiroai/Wiro-ComfyUI) | Wiro AI nodes for ComfyUI |
| [Wiro-Hermes](https://github.com/wiroai/Wiro-Hermes) | Wiro AI plugins for Hermes Agent: image, video, audio and 3D tools, plus the LLM gateway as a model provider |
| [Wiro-Zed](https://github.com/wiroai/Wiro-Zed) | Wiro AI MCP server extension for Zed |
| [Wiro-Action](https://github.com/wiroai/Wiro-Action) | GitHub Action for Wiro AI models and the LLM gateway, [on the GitHub Marketplace](https://github.com/marketplace/actions/wiro-ai-action) |
| [Wiro-WordPress](https://github.com/wiroai/Wiro-WordPress) | Wiro AI plugin for WordPress: featured images, image edits, alt text, narration and SEO suggestions |
| [Wiro-Obsidian](https://github.com/wiroai/Wiro-Obsidian) | Wiro AI plugin for Obsidian: images, video, speech, music, transcription and text tools |
| [Wiro-Blender](https://github.com/wiroai/Wiro-Blender) | Wiro AI add-on for Blender: text to 3D, image to 3D and textures |
| [Wiro-Figma](https://github.com/wiroai/Wiro-Figma) | Wiro AI plugin for Figma: images, vectors, image edits and text |
| [Wiro-Next-Starter](https://github.com/wiroai/Wiro-Next-Starter) | Next.js starter for Wiro AI: Playground, image, video and audio tools, and LLM chat, ready for Vercel and Railway |
| [Wiro-Docs](https://github.com/wiroai/Wiro-Docs) | Source of the Wiro AI API docs |

[Website](https://wiro.ai) · [Models](https://wiro.ai/models) · [Docs](https://wiro.ai/docs) · [X](https://x.com/wiroai)

## License

MIT, see [LICENSE](./LICENSE).
