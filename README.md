<div align="center">

<img src="https://raw.githubusercontent.com/wiroai/Wiro-Raycast/main/.github/assets/wiro-logo.png" alt="Wiro AI" width="240">

# Wiro AI for Raycast

Generate images and videos, chat with GPT, Claude, Gemini and other LLMs, and search 1,000+ AI models on Wiro AI from Raycast.

[![Raycast extension](https://img.shields.io/badge/Raycast-extension-111111?style=for-the-badge&color=111111)](https://www.raycast.com/) [![macOS](https://img.shields.io/badge/platform-macOS-111111?style=for-the-badge&color=111111)](#install) [![CI](https://img.shields.io/github/actions/workflow/status/wiroai/Wiro-Raycast/ci.yml?branch=main&style=for-the-badge&label=CI&color=111111)](https://github.com/wiroai/Wiro-Raycast/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-111111?style=for-the-badge&color=111111)](./LICENSE)

[Website](https://wiro.ai) · [Models](https://wiro.ai/models) · [Docs](https://wiro.ai/docs) · [Dashboard](https://wiro.ai/panel)

<img src="https://wiro.ai/images/koala/accent-heavy-koala.png" alt="Wiro AI koala mascot" width="60" />

</div>

This [Raycast](https://www.raycast.com) extension puts the [Wiro AI](https://wiro.ai) API in your launcher. Pick a model, write a prompt and get the result back in Raycast: copy an image to the clipboard, save a video to a folder, or keep a conversation going with the LLM you choose. Model lists, settings and prices come from the live Wiro AI catalog, so new models show up without an update to the extension.

## Commands

| Command | What it does |
| --- | --- |
| **Generate Image** | Pick a text-to-image model, write a prompt and set the model's options, such as resolution, ratio or quality. The image opens in Raycast, where you can copy it, save it or open it in your browser. |
| **Generate Video** | Make a video from a prompt (text to video) or from an image on your Mac (image to video). Raycast shows the task status while the model works. When the video is ready, open it, copy it or save it. |
| **Ask AI** | Chat with LLMs from OpenAI, Anthropic, Google, DeepSeek, xAI, Qwen and others through the Wiro AI LLM gateway. Choose the model in the dropdown, ask follow-up questions in the same conversation, and copy or paste the answers. Type a question after the command name to start right away. |
| **Search Models** | Search the catalog by name, owner or task and filter it by category. Each model shows its cover, description, typical run time and starting price. Open the model page, copy the model ID, or start Generate Image, Generate Video or Ask AI with that model. |

The model forms show each model's main settings with the choices and defaults from its page on wiro.ai, plus every setting that changes the price. The price for the settings you pick appears at the bottom of the form.

## Install

To run the extension from this repository:

1. Install [Raycast](https://www.raycast.com) and [Node.js](https://nodejs.org) 22.
2. Clone the repository and install its dependencies:

   ```bash
   git clone https://github.com/wiroai/Wiro-Raycast.git
   cd Wiro-Raycast
   npm install
   ```

3. Run `npm run dev`. Raycast loads the extension, and its four commands stay in Raycast after you stop the command with `Ctrl+C`.

## Set up

Raycast asks for your API key the first time you open one of the commands.

1. Sign up at [wiro.ai](https://wiro.ai) and create a project at [wiro.ai/panel/project/new](https://wiro.ai/panel/project/new). Your projects and their keys are listed at [wiro.ai/panel/project](https://wiro.ai/panel/project).
2. Paste the project's API key into **API Key**.
3. If you created the project with signature-based authentication, paste its API secret into **API Secret** as well. Leave it empty for an **API Key Only** project.

| Preference | Required | Description |
| --- | --- | --- |
| API Key | Yes | API key of your Wiro AI project |
| API Secret | For signature-based projects | API secret of the same project |
| Save Folder | No | Where Save Image and Save Video put files. Your Downloads folder is used when it is empty |

To change them later, open Raycast Settings, then **Extensions → Wiro AI**.

## Actions

| Screen | Actions |
| --- | --- |
| Image result | Copy Image (`↵`), Save Image (`⌘S`), Open Image in Browser (`⌘O`), Copy Image URL (`⌘⇧C`), Open Model Page, Open Task History |
| Video result | Open Video (`↵`), Save Video (`⌘S`), Copy Video (`⌘⇧V`), Copy Video URL (`⌘⇧C`), Open Model Page, Open Task History |
| Running task | Cancel Task (`⌃X`), Open Model Page, Open Task History |
| Ask AI | Send Message (`↵`), Copy Answer, Paste Answer (`⌘⇧↵`), Copy Question (`⌘⌥C`), Copy Conversation (`⌘⇧C`), Ask Again (`⌘R`), Stop Answer (`⌃X`), New Conversation (`⌘N`) |
| Search Models | Open Model Page (`↵`), Generate Image, Generate Video, Ask AI, Copy Model ID (`⌘⇧C`), Copy Model Page URL, Show or Hide Details (`⌘⇧D`) |

Ask AI keeps the conversation when you close Raycast. New Conversation starts a fresh one.

## How it works

- Generate Image and Generate Video read the model list for their category from the public catalog (`POST /Tool/List`) and the chosen model's settings and price list from `POST /Tool/Detail`. Required settings the form does not show are sent with the catalog default.
- A run is `POST /Run/{owner}/{model}` on `https://api.wiro.ai/v1`: JSON for a prompt, multipart form data when an image is attached ([Run a Model](https://wiro.ai/docs/run-a-model)).
- The extension polls `POST /Task/Detail` every few seconds until the task reaches `task_postprocess_end` or `task_cancel`, and checks `pexit` (`"0"` means success) before it shows the outputs ([Tasks](https://wiro.ai/docs/tasks)). Cancel Task calls `Task/Cancel` for a queued task and `Task/Kill` for a running one.
- Ask AI sends the conversation to `POST /v1/chat/completions` on the OpenAI-compatible gateway at `https://llm.wiro.ai/v1` with `stream: true`, and lists models from `GET /v1/models` ([LLM gateway](https://wiro.ai/docs/completions-api)).
- Signature-based projects sign every Run API request with `x-nonce` and `x-signature`, an HMAC-SHA256 of the secret and the nonce keyed with the API key. The gateway takes `key:secret` as its Bearer token ([Authentication](https://wiro.ai/docs/authentication)).
- Your key and secret stay in Raycast's encrypted preferences and go only to `api.wiro.ai` and `llm.wiro.ai`.

## Pricing

Searching models and reading their settings is free. Model runs and chat messages are charged to your project's wallet at each model's price on wiro.ai. When a model has a price list, the form shows the price for your settings, and the result shows what the task cost. Failed tasks are not charged. Ask AI shows each model's price per million tokens next to its answers.

## Development

```bash
npm install
npm run dev     # load the extension in Raycast in development mode
npm run lint    # ESLint, Prettier and Raycast's manifest checks
npm test        # unit tests for the API, parameter and price code
npm run build   # distribution build
```

The unit tests cover request signing, model settings, defaults, price matching, task status and output handling, and stream parsing, without calling the API.

## More from Wiro AI

| Repository | What it is |
| --- | --- |
| [Wiro-MCP](https://github.com/wiroai/Wiro-MCP) | Official MCP server for Wiro AI, [`@wiro-ai/wiro-mcp` on npm](https://www.npmjs.com/package/@wiro-ai/wiro-mcp) |
| [Wiro-LLM](https://github.com/wiroai/Wiro-LLM) | Wiro AI provider for the Vercel AI SDK, [`@wiro-ai/wiro-llm` on npm](https://www.npmjs.com/package/@wiro-ai/wiro-llm) |
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
| [Wiro-Hermes](https://github.com/wiroai/Wiro-Hermes) | Wiro AI model provider plugin for Hermes Agent |
| [Wiro-Zed](https://github.com/wiroai/Wiro-Zed) | Wiro AI MCP server extension for Zed |
| [Wiro-Action](https://github.com/wiroai/Wiro-Action) | GitHub Action for Wiro AI models and the LLM gateway, [on the GitHub Marketplace](https://github.com/marketplace/actions/wiro-ai-action) |
| [Wiro-Raycast](https://github.com/wiroai/Wiro-Raycast) | Wiro AI extension for Raycast: image and video generation, LLM chat and model search |
| [Wiro-Docs](https://github.com/wiroai/Wiro-Docs) | Source of the Wiro AI API docs |

[Website](https://wiro.ai) · [Models](https://wiro.ai/models) · [Docs](https://wiro.ai/docs) · [X](https://x.com/wiroai)

## License

MIT, see [LICENSE](./LICENSE).
