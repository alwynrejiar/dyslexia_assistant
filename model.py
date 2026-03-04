"""
model.py — Ollama Chat & Vision Client Module
Provides functions to connect to an Ollama API endpoint, select a model,
run interactive chat sessions, and send images to vision models.
Can be used standalone or imported by other scripts.
"""

import json
import time
import base64
import requests

HEADERS = {
    "ngrok-skip-browser-warning": "1",
    "Content-Type": "application/json",
}

DEFAULT_URL = "https://unjocund-madge-edgingly.ngrok-free.dev"


def connect(url=None):
    """
    Connect to an Ollama API endpoint.
    Returns the validated URL or raises SystemExit on failure.
    """
    url = (url or DEFAULT_URL).rstrip("/")
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code not in (200, 404):
            print(f"[WARN] Server responded with {r.status_code}\n{r.text[:300]}")
    except requests.exceptions.ConnectionError:
        print(f"[!] Cannot reach {url}")
        raise SystemExit(1)
    return url


def list_models(url):
    """
    Fetch the list of available models from the Ollama endpoint.
    Returns a list of model name strings.
    """
    try:
        r = requests.get(f"{url}/api/tags", headers=HEADERS, timeout=15)
        if r.status_code != 200:
            print(f"[!] Failed to list models ({r.status_code}): {r.text[:400]}")
            raise SystemExit(1)
        models = [m["name"] for m in r.json().get("models", [])]
    except requests.exceptions.ConnectionError:
        print("[!] Lost connection while listing models")
        raise SystemExit(1)
    if not models:
        print("[!] No models available on this server")
        raise SystemExit(1)
    return models


def select_model(url, prompt="Select model (number or name): "):
    """
    Display available models and let the user pick one interactively.
    Returns the chosen model name string.
    """
    models = list_models(url)
    print("\nAvailable models:")
    for i, name in enumerate(models, 1):
        print(f"  [{i}] {name}")
    chosen = None
    while not chosen:
        choice = input(prompt).strip()
        if choice.isdigit() and 0 < int(choice) <= len(models):
            chosen = models[int(choice) - 1]
        elif choice in models:
            chosen = choice
        else:
            print("  Invalid choice, try again.")
    return chosen


def encode_image_to_base64(image_path):
    """Read an image file and return its base64-encoded string."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def chat_stream(url, model, messages, images=None, max_retries=4, timeout=300):
    """
    Send a chat request to the Ollama API with streaming enabled.
    Supports sending images for vision models.

    Args:
        url:         Base URL of the Ollama server.
        model:       Model name to use.
        messages:    List of message dicts (role/content).
        images:      Optional list of base64-encoded image strings
                     (attached to the last user message for vision models).
        max_retries: Number of retry attempts.
        timeout:     Request timeout in seconds.

    Returns:
        The full assistant response text, or None on failure.
    """
    # If images are provided, attach them to the last user message
    send_messages = []
    for msg in messages:
        send_messages.append(dict(msg))  # shallow copy
    if images and send_messages:
        send_messages[-1]["images"] = images

    for attempt in range(1, max_retries + 1):
        try:
            with requests.post(
                f"{url}/api/chat",
                headers=HEADERS,
                json={"model": model, "messages": send_messages, "stream": True},
                stream=True,
                timeout=timeout,
            ) as r:
                if r.status_code == 504:
                    wait = 15 * attempt
                    print(f"\n[!] Gateway timeout — retrying in {wait}s...")
                    time.sleep(wait)
                    continue
                if not r.ok:
                    print(f"\n[!] Error {r.status_code}: {r.text[:300]}")
                    return None

                full_response = ""
                for line in r.iter_lines():
                    if line:
                        try:
                            chunk = json.loads(line)
                            delta = chunk.get("message", {}).get("content", "")
                            print(delta, end="", flush=True)
                            full_response += delta
                            if chunk.get("done"):
                                break
                        except json.JSONDecodeError:
                            pass
                return full_response

        except requests.exceptions.Timeout:
            wait = 15 * attempt
            print(f"\n[!] Request timed out — retrying in {wait}s...")
            time.sleep(wait)
        except requests.exceptions.RequestException as e:
            print(f"\n[!] Request error: {e}")
            return None

    print("\n[!] All retry attempts failed")
    return None


def transcribe_image(url, model, image_path, prompt=None):
    """
    Send an image to an Ollama vision model for transcription.

    Args:
        url:        Base URL of the Ollama server.
        model:      Vision model name (e.g. qwen3-vl:8b).
        image_path: Path to the image file.
        prompt:     Custom prompt text. Uses a dysgraphia transcription
                    prompt by default.

    Returns:
        The transcription text, or None on failure.
    """
    if prompt is None:
        prompt = (
            "You are an expert at reading and transcribing dysgraphic handwriting. "
            "Please transcribe the handwritten text in this image as accurately as possible. "
            "Crucially, preserve the exact spelling, grammar, spacing, and punctuation as written, "
            "even if it is incorrect. Do not autocorrect or fix mistakes, as analyzing these "
            "errors is necessary for diagnosing the writer's dysgraphia."
        )

    b64_image = encode_image_to_base64(image_path)
    messages = [{"role": "user", "content": prompt}]

    print("AI: ", end="", flush=True)
    result = chat_stream(url, model, messages, images=[b64_image])
    print()  # newline after streamed output
    return result


def interactive_chat(url, model, system_prompt=None, prefill_history=None):
    """
    Run an interactive chat loop in the terminal.

    Args:
        url:              Base URL of the Ollama server.
        model:            Model name to use.
        system_prompt:    Optional system message to set context.
        prefill_history:  Optional list of messages to pre-load into history.
    """
    print(f"\n── {model} ──")
    print("Type 'quit', 'exit', or 'q' to end the session.\n")

    history = []
    if system_prompt:
        history.append({"role": "system", "content": system_prompt})
    if prefill_history:
        history.extend(prefill_history)

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            break
        if user_input.lower() in {"quit", "exit", "q"}:
            print("Bye!")
            break
        if not user_input:
            continue

        history.append({"role": "user", "content": user_input})
        print("AI: ", end="", flush=True)

        response = chat_stream(url, model, history)
        print()  # newline after streamed response

        if response:
            history.append({"role": "assistant", "content": response})
        else:
            history.pop()  # remove failed user message


# ── Standalone mode ──────────────────────────────────────────────
if __name__ == "__main__":
    url = input(f"URL [{DEFAULT_URL}]: ").strip().rstrip("/") or DEFAULT_URL
    url = connect(url)
    model = select_model(url)
    interactive_chat(url, model)
