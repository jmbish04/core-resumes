see how the worker uses notebooklm-sdk (typescript) `src/frontend/content/docs/integrations/notebooklm.md`

# Python API Reference

**Status:** Active
**Last Updated:** 2026-03-12

Complete reference for the `notebooklm` Python library.

## Quick Start

```python
import asyncio
from notebooklm import NotebookLMClient

async def main():
    # Create client from saved authentication
    async with await NotebookLMClient.from_storage() as client:
        # List notebooks
        notebooks = await client.notebooks.list()
        print(f"Found {len(notebooks)} notebooks")

        # Create a new notebook
        nb = await client.notebooks.create("My Research")
        print(f"Created: {nb.id}")

        # Add sources
        await client.sources.add_url(nb.id, "https://example.com/article")

        # Ask a question
        result = await client.chat.ask(nb.id, "Summarize the main points")
        print(result.answer)

        # Generate a podcast
        status = await client.artifacts.generate_audio(nb.id)
        await client.artifacts.wait_for_completion(nb.id, status.task_id)
        output_path = await client.artifacts.download_audio(nb.id, "podcast.mp3")
        print(f"Audio saved to: {output_path}")

asyncio.run(main())
```

---

## Core Concepts

### Async Context Manager

The client must be used as an async context manager to properly manage HTTP connections:

```python
# Correct - uses context manager
async with await NotebookLMClient.from_storage() as client:
    ...

# Also correct - manual management
client = await NotebookLMClient.from_storage()
await client.__aenter__()
try:
    ...
finally:
    await client.__aexit__(None, None, None)
```

### Authentication

The client requires valid Google session cookies obtained via browser login:

```python
# From storage file (recommended)
client = await NotebookLMClient.from_storage()
client = await NotebookLMClient.from_storage("/path/to/storage_state.json")

# From a named profile
client = await NotebookLMClient.from_storage(profile="work")

# From AuthTokens directly
from notebooklm import AuthTokens
auth = AuthTokens(
    cookies={"SID": "...", "HSID": "...", ...},
    csrf_token="...",
    session_id="..."
)
client = NotebookLMClient(auth)

# AuthTokens also supports profiles
auth = AuthTokens.from_storage(profile="work")
```

**Environment Variable Support:**

The library respects these environment variables for authentication:

| Variable | Description |
|----------|-------------|
| `NOTEBOOKLM_HOME` | Base directory for config files (default: `~/.notebooklm`) |
| `NOTEBOOKLM_PROFILE` | Active profile name (default: `default`) |
| `NOTEBOOKLM_AUTH_JSON` | Inline auth JSON - no file needed (for CI/CD) |

**Precedence** (highest to lowest):
1. Explicit `path` argument to `from_storage()`
2. `NOTEBOOKLM_AUTH_JSON` environment variable
3. Explicit `profile` argument to `from_storage(profile="work")`
4. `NOTEBOOKLM_PROFILE` environment variable (resolves to `~/.notebooklm/profiles/<name>/storage_state.json`)
5. Active profile from `~/.notebooklm/active_profile`
6. `~/.notebooklm/profiles/default/storage_state.json`
7. `~/.notebooklm/storage_state.json` (legacy fallback)

**CI/CD Example:**
```python
import os

# Set auth JSON from environment (e.g., GitHub Actions secret)
os.environ["NOTEBOOKLM_AUTH_JSON"] = '{"cookies": [...]}'

# Client automatically uses the env var
async with await NotebookLMClient.from_storage() as client:
    notebooks = await client.notebooks.list()
```

### Error Handling

The library raises `RPCError` for API failures:

```python
from notebooklm import RPCError

try:
    result = await client.notebooks.create("Test")
except RPCError as e:
    print(f"RPC failed: {e}")
    # Common causes:
    # - Session expired (re-run `notebooklm login`)
    # - Rate limited (wait and retry)
    # - Invalid parameters
```

### Authentication & Token Refresh

**Automatic Refresh:** The client automatically refreshes CSRF tokens when authentication errors are detected. This happens transparently during any API call - you don't need to handle it manually.

When an RPC call fails with an auth error (HTTP 401/403 or auth-related message):
1. The client fetches fresh tokens from the NotebookLM homepage
2. Waits briefly to avoid rate limiting
3. Retries the failed request automatically

**Manual Refresh:** For proactive refresh (e.g., before a long-running operation):

```python
async with await NotebookLMClient.from_storage() as client:
    # Manually refresh CSRF token and session ID
    await client.refresh_auth()
```

**Note:** If your session cookies have fully expired (not just CSRF tokens), you'll need to re-run `notebooklm login`.

---

## API Reference

### NotebookLMClient

Main client class providing access to all APIs.

```python
class NotebookLMClient:
    notebooks: NotebooksAPI    # Notebook operations
    sources: SourcesAPI        # Source management
    artifacts: ArtifactsAPI    # AI-generated content
    chat: ChatAPI              # Conversations
    research: ResearchAPI      # Web/Drive research
    notes: NotesAPI            # User notes
    settings: SettingsAPI      # User settings (language, etc.)
    sharing: SharingAPI        # Notebook sharing
    auth: AuthTokens           # Current authentication tokens
    is_connected: bool         # Connection state

    @classmethod
    async def from_storage(
        cls, path: str | None = None, timeout: float = 30.0,
        profile: str | None = None
    ) -> "NotebookLMClient"

    def __init__(
        self, auth: AuthTokens, timeout: float = 30.0,
        storage_path: Path | None = None
    )

    async def refresh_auth(self) -> AuthTokens
```

---

### NotebooksAPI (`client.notebooks`)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `list()` | - | `list[Notebook]` | List all notebooks |
| `create(title)` | `title: str` | `Notebook` | Create a notebook |
| `get(notebook_id)` | `notebook_id: str` | `Notebook` | Get notebook details |
| `delete(notebook_id)` | `notebook_id: str` | `bool` | Delete a notebook |
| `rename(notebook_id, new_title)` | `notebook_id: str, new_title: str` | `Notebook` | Rename a notebook |
| `get_description(notebook_id)` | `notebook_id: str` | `NotebookDescription` | Get AI summary and topics |
| `get_metadata(notebook_id)` | `notebook_id: str` | `NotebookMetadata` | Get notebook metadata and sources |
| `get_summary(notebook_id)` | `notebook_id: str` | `str` | Get raw summary text |
| `share(notebook_id, public=True, artifact_id=None)` | `notebook_id: str, bool, str \| None` | `dict` | Create or update a share link |
| `get_share_url(notebook_id, artifact_id=None)` | `notebook_id: str, str \| None` | `str` | Get a share URL |
| `remove_from_recent(notebook_id)` | `notebook_id: str` | `None` | Remove from recently viewed |
| `get_raw(notebook_id)` | `notebook_id: str` | `Any` | Get raw API response data |

**Example:**
```python
# List all notebooks
notebooks = await client.notebooks.list()
for nb in notebooks:
    print(f"{nb.id}: {nb.title} ({nb.sources_count} sources)")

# Create and rename
nb = await client.notebooks.create("Draft")
nb = await client.notebooks.rename(nb.id, "Final Version")

# Get AI-generated description (parsed with suggested topics)
desc = await client.notebooks.get_description(nb.id)
print(desc.summary)
for topic in desc.suggested_topics:
    print(f"  - {topic.question}")

# Get raw summary text (unparsed)
summary = await client.notebooks.get_summary(nb.id)
print(summary)

# Get metadata for automation or exports
metadata = await client.notebooks.get_metadata(nb.id)
print(metadata.title)

# Enable public sharing and fetch the URL
await client.notebooks.share(nb.id, public=True)
url = await client.notebooks.get_share_url(nb.id)
print(url)
```

**get_summary vs get_description:**
- `get_summary()` returns the raw summary text string
- `get_description()` returns a `NotebookDescription` object with the parsed summary and a list of `SuggestedTopic` objects for suggested questions

---

### SourcesAPI (`client.sources`)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `list(notebook_id)` | `notebook_id: str` | `list[Source]` | List sources |
| `get(notebook_id, source_id)` | `str, str` | `Source` | Get source details |
| `get_fulltext(notebook_id, source_id)` | `str, str` | `SourceFulltext` | Get full indexed text content |
| `get_guide(notebook_id, source_id)` | `str, str` | `dict` | Get AI-generated summary and keywords |
| `add_url(notebook_id, url)` | `str, str` | `Source` | Add URL source |
| `add_youtube(notebook_id, url)` | `str, str` | `Source` | Add YouTube video |
| `add_text(notebook_id, title, content)` | `str, str, str` | `Source` | Add text content |
| `add_file(notebook_id, path, mime_type=None)` | `str, Path, str` | `Source` | Upload file |
| `add_drive(notebook_id, file_id, title, mime_type)` | `str, str, str, str` | `Source` | Add Google Drive doc |
| `rename(notebook_id, source_id, new_title)` | `str, str, str` | `Source` | Rename source |
| `refresh(notebook_id, source_id)` | `str, str` | `bool` | Refresh URL/Drive source |
| `check_freshness(notebook_id, source_id)` | `str, str` | `bool` | Check if source needs refresh |
| `delete(notebook_id, source_id)` | `str, str` | `bool` | Delete source |

**Example:**
```python
# Add various source types
await client.sources.add_url(nb_id, "https://example.com/article")
await client.sources.add_youtube(nb_id, "https://youtube.com/watch?v=...")
await client.sources.add_text(nb_id, "My Notes", "Content here...")
await client.sources.add_file(nb_id, Path("./document.pdf"))

# List and manage
sources = await client.sources.list(nb_id)
for src in sources:
    print(f"{src.id}: {src.title} ({src.kind})")

await client.sources.rename(nb_id, src.id, "Better Title")
await client.sources.refresh(nb_id, src.id)  # Re-fetch URL content

# Check if a source needs refreshing (content changed)
is_fresh = await client.sources.check_freshness(nb_id, src.id)
if not is_fresh:
    await client.sources.refresh(nb_id, src.id)

# Get full indexed content (what NotebookLM uses for answers)
fulltext = await client.sources.get_fulltext(nb_id, src.id)
print(f"Content ({fulltext.char_count} chars): {fulltext.content[:500]}...")

# Get AI-generated summary and keywords
guide = await client.sources.get_guide(nb_id, src.id)
print(f"Summary: {guide['summary']}")
print(f"Keywords: {guide['keywords']}")
```

---

### ArtifactsAPI (`client.artifacts`)

#### Core Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `list(notebook_id, type=None)` | `str, int` | `list[Artifact]` | List artifacts |
| `get(notebook_id, artifact_id)` | `str, str` | `Artifact` | Get artifact details |
| `delete(notebook_id, artifact_id)` | `str, str` | `bool` | Delete artifact |
| `rename(notebook_id, artifact_id, new_title)` | `str, str, str` | `None` | Rename artifact |
| `poll_status(notebook_id, task_id)` | `str, str` | `GenerationStatus` | Check generation status |
| `wait_for_completion(notebook_id, task_id, ...)` | `str, str, ...` | `GenerationStatus` | Wait for generation |

#### Type-Specific List Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `list_audio(notebook_id)` | `str` | `list[Artifact]` | List audio overview artifacts |
| `list_video(notebook_id)` | `str` | `list[Artifact]` | List video overview artifacts |
| `list_reports(notebook_id)` | `str` | `list[Artifact]` | List report artifacts (Briefing Doc, Study Guide, Blog Post) |
| `list_quizzes(notebook_id)` | `str` | `list[Artifact]` | List quiz artifacts |
| `list_flashcards(notebook_id)` | `str` | `list[Artifact]` | List flashcard artifacts |
| `list_infographics(notebook_id)` | `str` | `list[Artifact]` | List infographic artifacts |
| `list_slide_decks(notebook_id)` | `str` | `list[Artifact]` | List slide deck artifacts |
| `list_data_tables(notebook_id)` | `str` | `list[Artifact]` | List data table artifacts |

#### Generation Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `generate_audio(...)` | See below | `GenerationStatus` | Generate podcast |
| `generate_video(...)` | See below | `GenerationStatus` | Generate video |
| `generate_report(...)` | See below | `GenerationStatus` | Generate report |
| `generate_quiz(...)` | See below | `GenerationStatus` | Generate quiz |
| `generate_flashcards(...)` | See below | `GenerationStatus` | Generate flashcards |
| `generate_slide_deck(...)` | See below | `GenerationStatus` | Generate slide deck |
| `generate_infographic(...)` | See below | `GenerationStatus` | Generate infographic |
| `generate_data_table(...)` | See below | `GenerationStatus` | Generate data table |
| `generate_mind_map(...)` | See below | `dict` | Generate mind map |

#### Downloading Artifacts

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `download_audio(notebook_id, output_path, artifact_id=None)` | `str, str, str` | `str` | Download audio to file (MP4/MP3) |
| `download_video(notebook_id, output_path, artifact_id=None)` | `str, str, str` | `str` | Download video to file (MP4) |
| `download_infographic(notebook_id, output_path, artifact_id=None)` | `str, str, str` | `str` | Download infographic to file (PNG) |
| `download_slide_deck(notebook_id, output_path, artifact_id=None)` | `str, str, str` | `str` | Download slide deck as PDF |
| `download_report(notebook_id, output_path, artifact_id=None)` | `str, str, str` | `str` | Download report as Markdown (.md) |
| `download_mind_map(notebook_id, output_path, artifact_id=None)` | `str, str, str` | `str` | Download mind map as JSON (.json) |
| `download_data_table(notebook_id, output_path, artifact_id=None)` | `str, str, str` | `str` | Download data table as CSV (.csv) |
| `download_quiz(notebook_id, output_path, artifact_id=None, output_format="json")` | `str, str, str, str` | `str` | Download quiz (json/markdown/html) |
| `download_flashcards(notebook_id, output_path, artifact_id=None, output_format="json")` | `str, str, str, str` | `str` | Download flashcards (json/markdown/html) |

**Download Methods:**

```python
# Download the most recent completed audio overview
path = await client.artifacts.download_audio(nb_id, "podcast.mp4")

# Download a specific audio artifact by ID
path = await client.artifacts.download_audio(nb_id, "podcast.mp4", artifact_id="abc123")

# Download video overview
path = await client.artifacts.download_video(nb_id, "video.mp4")

# Download infographic
path = await client.artifacts.download_infographic(nb_id, "infographic.png")

# Download slide deck as PDF
path = await client.artifacts.download_slide_deck(nb_id, "./slides.pdf")
# Returns: "./slides.pdf"

# Download report as Markdown
path = await client.artifacts.download_report(nb_id, "./study-guide.md")
# Extracts markdown content from Briefing Doc, Study Guide, Blog Post, etc.

# Download mind map as JSON
path = await client.artifacts.download_mind_map(nb_id, "./concept-map.json")
# JSON structure: {"name": "Topic", "children": [{"name": "Subtopic", ...}]}

# Download data table as CSV
path = await client.artifacts.download_data_table(nb_id, "./data.csv")
# CSV uses UTF-8 with BOM encoding for Excel compatibility

# Download quiz as JSON (default)
path = await client.artifacts.download_quiz(nb_id, "quiz.json")

# Download quiz as markdown with answers marked
path = await client.artifacts.download_quiz(nb_id, "quiz.md", output_format="markdown")

# Download flashcards as JSON (normalizes f/b to front/back)
path = await client.artifacts.download_flashcards(nb_id, "cards.json")

# Download flashcards as markdown
path = await client.artifacts.download_flashcards(nb_id, "cards.md", output_format="markdown")
```

**Notes:**
- If `artifact_id` is not specified, downloads the first completed artifact of that type
- Raises `ValueError` if no completed artifact is found
- Some URLs require browser-based download (handled automatically)
- Report downloads extract the markdown content from the artifact
- Mind map downloads return a JSON tree structure with `name` and `children` fields
- Data table downloads parse the complex rich-text format into CSV rows/columns
- Quiz/flashcard formats: `json` (structured), `markdown` (readable), `html` (raw)
- Downloads automatically use the storage path from `from_storage(path=...)` or the resolved profile for cookie authentication

#### Export Methods

Export artifacts to Google Docs or Google Sheets.

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `export_report(notebook_id, artifact_id, title, export_type)` | `str, str, str, ExportType` | `Any` | Export report to Google Docs/Sheets |
| `export_data_table(notebook_id, artifact_id, title)` | `str, str, str` | `Any` | Export data table to Google Sheets |
| `export(notebook_id, artifact_id, content, title, export_type)` | `str, str, str, str, ExportType` | `Any` | Generic export to Docs/Sheets |

**Export Types (ExportType enum):**
- `ExportType.DOCS` (1): Export to Google Docs
- `ExportType.SHEETS` (2): Export to Google Sheets

```python
from notebooklm import ExportType

# Export a report to Google Docs
result = await client.artifacts.export_report(
    nb_id,
    artifact_id="report_123",
    title="My Briefing Doc",
    export_type=ExportType.DOCS
)
# result contains the Google Docs URL

# Export a data table to Google Sheets
result = await client.artifacts.export_data_table(
    nb_id,
    artifact_id="table_456",
    title="Research Data"
)
# result contains the Google Sheets URL

# Generic export (e.g., export any artifact to Sheets)
result = await client.artifacts.export(
    nb_id,
    artifact_id="artifact_789",
    title="Exported Content",
    export_type=ExportType.SHEETS
)
```

**Generation Methods:**

```python
# Audio (podcast)
status = await client.artifacts.generate_audio(
    notebook_id,
    source_ids=None,           # List of source IDs (None = all)
    instructions="...",        # Custom instructions
    audio_format=AudioFormat.DEEP_DIVE,  # DEEP_DIVE, BRIEF, CRITIQUE, DEBATE
    audio_length=AudioLength.DEFAULT,    # SHORT, DEFAULT, LONG
    language="en"
)

# Video
status = await client.artifacts.generate_video(
    notebook_id,
    source_ids=None,
    instructions="...",
    video_format=VideoFormat.EXPLAINER,  # EXPLAINER, BRIEF
    video_style=VideoStyle.AUTO_SELECT,  # AUTO_SELECT, CLASSIC, WHITEBOARD, KAWAII, ANIME, etc.
    language="en"
)

# Report
status = await client.artifacts.generate_report(
    notebook_id,
    report_format=ReportFormat.STUDY_GUIDE,  # BRIEFING_DOC, STUDY_GUIDE, BLOG_POST, CUSTOM
    source_ids=None,
    language="en",
    custom_prompt=None,          # Used with ReportFormat.CUSTOM
    extra_instructions="..."     # Optional append for built-in formats
)

# Quiz
status = await client.artifacts.generate_quiz(
    notebook_id,
    source_ids=None,
    instructions="...",
    quantity=QuizQuantity.MORE,        # FEWER, STANDARD, MORE (MORE aliases STANDARD)
    difficulty=QuizDifficulty.MEDIUM,  # EASY, MEDIUM, HARD
)
```

**Waiting for Completion:**

```python
# Start generation
status = await client.artifacts.generate_audio(nb_id)

# Wait with polling
final = await client.artifacts.wait_for_completion(
    nb_id,
    status.task_id,
    timeout=300,      # Max wait time in seconds
    poll_interval=5   # Seconds between polls
)

if final.is_complete:
    path = await client.artifacts.download_audio(nb_id, "podcast.mp3")
    print(f"Saved to: {path}")
else:
    print(f"Failed or timed out: {final.status}")
```

---

### ChatAPI (`client.chat`)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `ask(notebook_id, question, ...)` | `str, str, ...` | `AskResult` | Ask a question |
| `configure(notebook_id, ...)` | `str, ...` | `bool` | Set chat persona |
| `get_history(notebook_id, limit=100, conversation_id=None)` | `str, int, str` | `list[tuple[str, str]]` | Get Q&A pairs from most recent conversation |
| `get_conversation_id(notebook_id)` | `str` | `str \| None` | Get most recent conversation ID from server |

**ask() Parameters:**
```python
async def ask(
    notebook_id: str,
    question: str,
    source_ids: list[str] | None = None,  # Limit to specific sources (None = all)
    conversation_id: str | None = None,   # Continue existing conversation
) -> AskResult
```

**Example:**
```python
# Ask questions (uses all sources)
result = await client.chat.ask(nb_id, "What are the main themes?")
print(result.answer)

# Access source references (cited in answer as [1], [2], etc.)
for ref in result.references:
    print(f"Citation {ref.citation_number}: Source {ref.source_id}")

# Ask using only specific sources
result = await client.chat.ask(
    nb_id,
    "Summarize the key points",
    source_ids=["src_001", "src_002"]
)

# Continue conversation
result = await client.chat.ask(
    nb_id,
    "Can you elaborate on the first point?",
    conversation_id=result.conversation_id
)

# Configure persona
await client.chat.configure(
    nb_id,
    goal=ChatGoal.LEARNING_GUIDE,
    response_length=ChatResponseLength.LONGER,
    custom_prompt="Focus on practical applications"
)
```

---

### ResearchAPI (`client.research`)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `start(notebook_id, query, source, mode)` | `str, str, str="web", str="fast"` | `dict` | Start research (mode: "fast" or "deep") |
| `poll(notebook_id)` | `str` | `dict` | Check research status |
| `import_sources(notebook_id, task_id, sources)` | `str, str, list` | `list[dict]` | Import findings |

**Method Signatures:**

```python
async def start(
    notebook_id: str,
    query: str,
    source: str = "web",   # "web" or "drive"
    mode: str = "fast",    # "fast" or "deep" (deep only for web)
) -> dict:
    """
    Returns: {"task_id": str, "report_id": str, "notebook_id": str, "query": str, "mode": str}
    Raises: ValueError if source/mode combination is invalid
    """

async def poll(notebook_id: str) -> dict:
    """
    Returns: {"task_id": str, "status": str, "query": str, "sources": list, "summary": str}
    Status is "completed", "in_progress", or "no_research"
    """

async def import_sources(notebook_id: str, task_id: str, sources: list[dict]) -> list[dict]:
    """
    sources: List of dicts with 'url' and 'title' keys
    Returns: List of imported sources with 'id' and 'title'
    """
```

**Example:**
```python
# Start fast web research (default)
result = await client.research.start(nb_id, "AI safety regulations")
task_id = result["task_id"]

# Start deep web research
result = await client.research.start(nb_id, "quantum computing", source="web", mode="deep")
task_id = result["task_id"]

# Start fast Drive research
result = await client.research.start(nb_id, "project docs", source="drive", mode="fast")

# Poll until complete
import asyncio
while True:
    status = await client.research.poll(nb_id)
    if status["status"] == "completed":
        break
    await asyncio.sleep(10)

# Import discovered sources
imported = await client.research.import_sources(nb_id, task_id, status["sources"][:5])
print(f"Imported {len(imported)} sources")
```

---

### NotesAPI (`client.notes`)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `list(notebook_id)` | `str` | `list[Note]` | List text notes (excludes mind maps) |
| `create(notebook_id, title="New Note", content="")` | `str, str, str` | `Note` | Create note |
| `get(notebook_id, note_id)` | `str, str` | `Optional[Note]` | Get note by ID |
| `update(notebook_id, note_id, content, title)` | `str, str, str, str` | `None` | Update note content and title |
| `delete(notebook_id, note_id)` | `str, str` | `bool` | Delete note |
| `list_mind_maps(notebook_id)` | `str` | `list[Any]` | List mind maps in the notebook |
| `delete_mind_map(notebook_id, mind_map_id)` | `str, str` | `bool` | Delete a mind map |

**Example:**
```python
# Create and manage notes
note = await client.notes.create(nb_id, title="Meeting Notes", content="Discussion points...")
notes = await client.notes.list(nb_id)

# Update a note
await client.notes.update(nb_id, note.id, "Updated content", "New Title")

# Delete a note
await client.notes.delete(nb_id, note.id)
```

**Mind Maps:**

Mind maps are stored internally using the same structure as notes but contain JSON data with hierarchical node information. The `list()` method excludes mind maps automatically, while `list_mind_maps()` returns only mind maps.

```python
# List all mind maps in a notebook
mind_maps = await client.notes.list_mind_maps(nb_id)
for mm in mind_maps:
    mm_id = mm[0]  # Mind map ID is at index 0
    print(f"Mind map: {mm_id}")

# Delete a mind map
await client.notes.delete_mind_map(nb_id, mind_map_id)
```

**Note:** Mind maps are detected by checking if the content contains `'"children":' or `'"nodes":'` keys, which indicate JSON mind map data structure.

---

### SettingsAPI (`client.settings`)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `get_output_language()` | none | `Optional[str]` | Get current output language setting |
| `get_account_limits()` | none | `AccountLimits` | Get account-level limits such as max notebooks and sources per notebook |
| `get_account_tier()` | none | `AccountTier` | Get current NotebookLM subscription tier |
| `set_output_language(language)` | `str` | `Optional[str]` | Set output language for artifact generation |

**Example:**
```python
# Get current language setting
lang = await client.settings.get_output_language()
print(f"Current language: {lang}")  # e.g., "en", "ja", "zh_Hans"

# Get server-reported account limits
limits = await client.settings.get_account_limits()
print(f"Notebook limit: {limits.notebook_limit}")

# Get current NotebookLM subscription tier
tier = await client.settings.get_account_tier()
print(f"Account tier: {tier.plan_name or tier.tier}")

# Set language for artifact generation
result = await client.settings.set_output_language("ja")  # Japanese
print(f"Language set to: {result}")
```

**Important:** Language is a **GLOBAL setting** that affects all notebooks in your account. The tier string is internal NotebookLM metadata; use `get_account_limits()` for quota decisions because the raw tier name may not match the active notebook/source limits. Supported languages include:
- `en` (English), `ja` (日本語), `zh_Hans` (中文简体), `zh_Hant` (中文繁體)
- `ko` (한국어), `es` (Español), `fr` (Français), `de` (Deutsch), `pt_BR` (Português)
- And [over 70 other languages](cli-reference.md#language-commands-notebooklm-language-cmd)

---

### SharingAPI (`client.sharing`)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `get_status(notebook_id)` | `str` | `ShareStatus` | Get current sharing configuration |
| `set_public(notebook_id, public)` | `str, bool` | `ShareStatus` | Enable/disable public link sharing |
| `set_view_level(notebook_id, level)` | `str, ShareViewLevel` | `None` | Set what viewers can access |
| `add_user(notebook_id, email, permission, notify, welcome_message)` | `str, str, SharePermission, bool, str` | `ShareStatus` | Share with a user |
| `update_user(notebook_id, email, permission)` | `str, str, SharePermission` | `ShareStatus` | Update user's permission |
| `remove_user(notebook_id, email)` | `str, str` | `ShareStatus` | Remove user's access |

**Example:**
```python
from notebooklm import SharePermission, ShareViewLevel

# Get current sharing status
status = await client.sharing.get_status(notebook_id)
print(f"Public: {status.is_public}")
print(f"Users: {[u.email for u in status.shared_users]}")

# Enable public sharing (anyone with link)
status = await client.sharing.set_public(notebook_id, True)
print(f"Share URL: {status.share_url}")

# Set view level (what viewers can access)
await client.sharing.set_view_level(notebook_id, ShareViewLevel.CHAT_ONLY)

# Share with specific users
status = await client.sharing.add_user(
    notebook_id,
    "colleague@example.com",
    SharePermission.VIEWER,
    notify=True,
    welcome_message="Check out my research!"
)

# Update user permission
status = await client.sharing.update_user(
    notebook_id,
    "colleague@example.com",
    SharePermission.EDITOR
)

# Remove user access
status = await client.sharing.remove_user(notebook_id, "colleague@example.com")

# Disable public sharing
status = await client.sharing.set_public(notebook_id, False)
```

**Permission Levels:**
- `SharePermission.OWNER` - Full control (read-only, cannot be assigned)
- `SharePermission.EDITOR` - Can edit notebook content
- `SharePermission.VIEWER` - Read-only access

**View Levels:**
- `ShareViewLevel.FULL_NOTEBOOK` - Viewers can access chat, sources, and notes
- `ShareViewLevel.CHAT_ONLY` - Viewers can only access the chat interface

---

## Data Types

### Notebook

```python
@dataclass
class Notebook:
    id: str
    title: str
    created_at: Optional[datetime]
    sources_count: int
    is_owner: bool
```

### Source

```python
@dataclass
class Source:
    id: str
    title: Optional[str]
    url: Optional[str]
    created_at: Optional[datetime]

    @property
    def kind(self) -> SourceType:
        """Get source type as SourceType enum."""
```

**Type Identification:**

Use the `.kind` property to identify source types. It returns a `SourceType` enum which is also a `str`, enabling both enum and string comparisons:

```python
from notebooklm import SourceType

# Enum comparison (recommended)
if source.kind == SourceType.PDF:
    print("This is a PDF")

# String comparison (also works)
if source.kind == "pdf":
    print("This is a PDF")

# Use in f-strings
print(f"Type: {source.kind}")  # "Type: pdf"
```

### Artifact

```python
@dataclass
class Artifact:
    id: str
    title: str
    status: int                     # 1=processing, 2=pending, 3=completed
    created_at: Optional[datetime]
    url: Optional[str]

    @property
    def kind(self) -> ArtifactType:
        """Get artifact type as ArtifactType enum."""

    @property
    def is_completed(self) -> bool:
        """Check if artifact generation is complete."""

    @property
    def is_quiz(self) -> bool:
        """Check if this is a quiz artifact."""

    @property
    def is_flashcards(self) -> bool:
        """Check if this is a flashcards artifact."""
```

**Type Identification:**

Use the `.kind` property to identify artifact types. It returns an `ArtifactType` enum which is also a `str`:

```python
from notebooklm import ArtifactType

# Enum comparison (recommended)
if artifact.kind == ArtifactType.AUDIO:
    print("This is an audio overview")

# String comparison (also works)
if artifact.kind == "audio":
    print("This is an audio overview")

# Check specific types
if artifact.is_quiz:
    print("This is a quiz")
elif artifact.is_flashcards:
    print("This is a flashcard deck")
```

### AskResult

```python
@dataclass
class AskResult:
    answer: str                        # The answer text with inline citations [1], [2], etc.
    conversation_id: str               # ID for follow-up questions
    turn_number: int                   # Turn number in conversation
    is_follow_up: bool                 # Whether this was a follow-up question
    references: list[ChatReference]    # Source references cited in the answer
    raw_response: str                  # First 1000 chars of raw API response

@dataclass
class ChatReference:
    source_id: str                     # UUID of the source
    citation_number: int | None        # Citation number in answer (1, 2, etc.)
    cited_text: str | None             # Actual text passage being cited
    start_char: int | None             # Start position in source content
    end_char: int | None               # End position in source content
    chunk_id: str | None               # Internal chunk ID (for debugging)
```

**Important:** The `cited_text` field often contains only a snippet or section header, not the full quoted passage. The `start_char`/`end_char` positions reference NotebookLM's internal chunked index, which does not directly correspond to positions in the raw fulltext returned by `get_fulltext()`.

Use `SourceFulltext.find_citation_context()` to locate citations in the fulltext:

```python
fulltext = await client.sources.get_fulltext(notebook_id, ref.source_id)
matches = fulltext.find_citation_context(ref.cited_text)  # Returns list[(context, position)]

if matches:
    context, pos = matches[0]  # First match
    if len(matches) > 1:
        print(f"Warning: {len(matches)} matches found, using first")
else:
    context = None  # Not found - may occur if source was modified
```

**Tip:** Cache `fulltext` when processing multiple citations from the same source to avoid repeated API calls.

### ShareStatus

```python
@dataclass
class ShareStatus:
    notebook_id: str                   # The notebook ID
    is_public: bool                    # Whether publicly accessible
    access: ShareAccess                # RESTRICTED or ANYONE_WITH_LINK
    view_level: ShareViewLevel         # FULL_NOTEBOOK or CHAT_ONLY
    shared_users: list[SharedUser]     # List of users with access
    share_url: str | None              # Public URL if is_public=True
```

### SharedUser

```python
@dataclass
class SharedUser:
    email: str                         # User's email address
    permission: SharePermission        # OWNER, EDITOR, or VIEWER
    display_name: str | None           # User's display name
    avatar_url: str | None             # URL to user's avatar image
```

### SourceFulltext

```python
@dataclass
class SourceFulltext:
    source_id: str                     # UUID of the source
    title: str                         # Source title
    content: str                       # Full indexed text content
    url: str | None                    # Original URL (if applicable)
    char_count: int                    # Character count

    @property
    def kind(self) -> SourceType:
        """Get source type as SourceType enum."""

    def find_citation_context(
        self,
        cited_text: str,
        context_chars: int = 200,
    ) -> list[tuple[str, int]]:
        """Search for citation text, return list of (context, position) tuples."""
```

**Type Identification:**

Like `Source`, use the `.kind` property to get the source type:

```python
fulltext = await client.sources.get_fulltext(nb_id, source_id)
print(f"Content type: {fulltext.kind}")  # "pdf", "web_page", etc.
```

---

## Enums

### Audio Generation

```python
class AudioFormat(Enum):
    DEEP_DIVE = 1   # In-depth discussion
    BRIEF = 2       # Quick summary
    CRITIQUE = 3    # Critical analysis
    DEBATE = 4      # Two-sided debate

class AudioLength(Enum):
    SHORT = 1
    DEFAULT = 2
    LONG = 3
```

### Video Generation

```python
class VideoFormat(Enum):
    EXPLAINER = 1
    BRIEF = 2

class VideoStyle(Enum):
    AUTO_SELECT = 1
    CUSTOM = 2
    CLASSIC = 3
    WHITEBOARD = 4
    KAWAII = 5
    ANIME = 6
    WATERCOLOR = 7
    RETRO_PRINT = 8
    HERITAGE = 9
    PAPER_CRAFT = 10
```

### Quiz/Flashcards

```python
class QuizQuantity(Enum):
    FEWER = 1
    STANDARD = 2
    MORE = 2  # Alias of STANDARD used by the CLI/web UI

class QuizDifficulty(Enum):
    EASY = 1
    MEDIUM = 2
    HARD = 3
```

### Reports

```python
class ReportFormat(Enum):
    BRIEFING_DOC = 1
    STUDY_GUIDE = 2
    BLOG_POST = 3
    CUSTOM = 4
```

### Infographics

```python
class InfographicOrientation(Enum):
    LANDSCAPE = 1
    PORTRAIT = 2
    SQUARE = 3

class InfographicDetail(Enum):
    CONCISE = 1
    STANDARD = 2
    DETAILED = 3
```

### Slide Decks

```python
class SlideDeckFormat(Enum):
    DETAILED_DECK = 1
    PRESENTER_SLIDES = 2

class SlideDeckLength(Enum):
    DEFAULT = 1
    SHORT = 2
```

### Export

```python
class ExportType(Enum):
    DOCS = 1    # Export to Google Docs
    SHEETS = 2  # Export to Google Sheets
```

### Sharing

```python
class ShareAccess(Enum):
    RESTRICTED = 0        # Only explicitly shared users
    ANYONE_WITH_LINK = 1  # Public link access

class ShareViewLevel(Enum):
    FULL_NOTEBOOK = 0     # Chat + sources + notes
    CHAT_ONLY = 1         # Chat interface only

class SharePermission(Enum):
    OWNER = 1             # Full control (read-only, cannot assign)
    EDITOR = 2            # Can edit notebook
    VIEWER = 3            # Read-only access
```

### Source and Artifact Types

```python
class SourceType(str, Enum):
    """Source types - use with source.kind property.

    This is a str enum, enabling both enum and string comparisons:
        source.kind == SourceType.PDF   # True
        source.kind == "pdf"            # Also True
    """
    GOOGLE_DOCS = "google_docs"
    GOOGLE_SLIDES = "google_slides"
    GOOGLE_SPREADSHEET = "google_spreadsheet"
    PDF = "pdf"
    PASTED_TEXT = "pasted_text"
    WEB_PAGE = "web_page"
    GOOGLE_DRIVE_AUDIO = "google_drive_audio"
    GOOGLE_DRIVE_VIDEO = "google_drive_video"
    YOUTUBE = "youtube"
    MARKDOWN = "markdown"
    DOCX = "docx"
    CSV = "csv"
    IMAGE = "image"
    MEDIA = "media"
    UNKNOWN = "unknown"

class ArtifactType(str, Enum):
    """Artifact types - use with artifact.kind property.

    This is a str enum that hides internal variant complexity.
    Quizzes and flashcards are distinguished automatically.
    """
    AUDIO = "audio"
    VIDEO = "video"
    REPORT = "report"
    QUIZ = "quiz"
    FLASHCARDS = "flashcards"
    MIND_MAP = "mind_map"
    INFOGRAPHIC = "infographic"
    SLIDE_DECK = "slide_deck"
    DATA_TABLE = "data_table"
    UNKNOWN = "unknown"

class SourceStatus(Enum):
    PROCESSING = 1  # Source is being processed (indexing content)
    READY = 2       # Source is ready for use
    ERROR = 3       # Source processing failed
    PREPARING = 5   # Source is being prepared/uploaded (pre-processing stage)
```

**Usage Example:**
```python
from notebooklm import SourceType, ArtifactType

# List sources by type using .kind property
sources = await client.sources.list(nb_id)
for src in sources:
    if src.kind == SourceType.PDF:
        print(f"PDF: {src.title}")
    elif src.kind == SourceType.MEDIA:
        print(f"Audio/Video: {src.title}")
    elif src.kind == SourceType.IMAGE:
        print(f"Image (OCR'd): {src.title}")
    elif src.kind == SourceType.UNKNOWN:
        print(f"Unknown type: {src.title}")

# List artifacts by type using .kind property
artifacts = await client.artifacts.list(nb_id)
for art in artifacts:
    if art.kind == ArtifactType.AUDIO:
        print(f"Audio: {art.title}")
    elif art.kind == ArtifactType.VIDEO:
        print(f"Video: {art.title}")
    elif art.kind == ArtifactType.QUIZ:
        print(f"Quiz: {art.title}")
```

### Chat Configuration

```python
class ChatGoal(Enum):
    DEFAULT = 1        # General purpose
    CUSTOM = 2         # Uses custom_prompt
    LEARNING_GUIDE = 3 # Educational focus

class ChatResponseLength(Enum):
    DEFAULT = 1
    LONGER = 4
    SHORTER = 5

class ChatMode(Enum):
    """Predefined chat modes for common use cases (service-level enum)."""
    DEFAULT = "default"          # General purpose
    LEARNING_GUIDE = "learning_guide"  # Educational focus
    CONCISE = "concise"          # Brief responses
    DETAILED = "detailed"        # Verbose responses
```

**ChatGoal vs ChatMode:**
- `ChatGoal` is an RPC-level enum used with `client.chat.configure()` for low-level API configuration
- `ChatMode` is a service-level enum providing predefined configurations for common use cases

---

## Advanced Usage

### Custom RPC Calls

For undocumented features, you can make raw RPC calls:

```python
from notebooklm.rpc import RPCMethod

async with await NotebookLMClient.from_storage() as client:
    # Access the core client for raw RPC
    result = await client._core.rpc_call(
        RPCMethod.SOME_METHOD,
        params=[...],
        source_path="/notebook/123"
    )
```

### Handling Rate Limits

Google rate limits aggressive API usage:

```python
import asyncio
from notebooklm import RPCError

async def safe_create_notebooks(client, titles):
    for title in titles:
        try:
            await client.notebooks.create(title)
        except RPCError:
            # Wait and retry on rate limit
            await asyncio.sleep(10)
            await client.notebooks.create(title)
        # Add delay between operations
        await asyncio.sleep(2)
```

### Streaming Chat Responses

The chat endpoint supports streaming (internal implementation):

```python
# Standard (non-streaming) - recommended
result = await client.chat.ask(nb_id, "Question")
print(result.answer)

# Streaming is handled internally by the library
# The ask() method returns the complete response
```

# Configuration

**Status:** Active
**Last Updated:** 2026-01-20

This guide covers storage locations, environment settings, and configuration options for `notebooklm-py`.

## File Locations

All data is stored under `~/.notebooklm/` by default, organized by profile:

```
~/.notebooklm/
├── active_profile        # Tracks the current profile name
├── profiles/
│   ├── default/          # Default profile (auto-created)
│   │   ├── storage_state.json    # Authentication cookies and session
│   │   ├── context.json          # CLI context (active notebook, conversation)
│   │   └── browser_profile/      # Persistent Chromium profile
│   ├── work/             # Named profile example
│   │   ├── storage_state.json
│   │   ├── context.json
│   │   └── browser_profile/
│   └── personal/
│       └── ...
```

**Legacy layout:** If upgrading from a pre-profile version, the first run auto-migrates flat files into `profiles/default/`. The legacy flat layout continues to work as a fallback.

You can relocate all files by setting `NOTEBOOKLM_HOME`:

```bash
export NOTEBOOKLM_HOME=/custom/path
# All files now go to /custom/path/profiles/<profile>/
```

### Storage State (`storage_state.json`)

Contains the authentication data extracted from your browser session:

```json
{
  "cookies": [
    {
      "name": "SID",
      "value": "...",
      "domain": ".google.com",
      "path": "/",
      "expires": 1234567890,
      "httpOnly": true,
      "secure": true,
      "sameSite": "Lax"
    },
    ...
  ],
  "origins": []
}
```

**Required cookies:** `SID`, `HSID`, `SSID`, `APISID`, `SAPISID`, `__Secure-1PSID`, `__Secure-3PSID`

**Override location:**
```bash
notebooklm --storage /path/to/storage_state.json list
```

### Context File (`context.json`)

Stores the current CLI context (active notebook and conversation):

```json
{
  "notebook_id": "abc123def456",
  "conversation_id": "conv789"
}
```

This file is managed automatically by `notebooklm use` and `notebooklm clear`.

### Browser Profile (`browser_profile/`)

A persistent Chromium user data directory used during `notebooklm login`.

**Why persistent?** Google blocks automated login attempts. A persistent profile makes the browser appear as a regular user installation, avoiding bot detection.

**To reset:** Delete the `browser_profile/` directory and run `notebooklm login` again.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NOTEBOOKLM_HOME` | Base directory for all files | `~/.notebooklm` |
| `NOTEBOOKLM_PROFILE` | Active profile name | `default` |
| `NOTEBOOKLM_AUTH_JSON` | Inline authentication JSON (for CI/CD) | - |
| `NOTEBOOKLM_LOG_LEVEL` | Logging level: `DEBUG`, `INFO`, `WARNING`, `ERROR` | `WARNING` |
| `NOTEBOOKLM_DEBUG_RPC` | Legacy: Enable RPC debug logging (use `LOG_LEVEL=DEBUG` instead) | `false` |

### NOTEBOOKLM_HOME

Relocates all configuration files to a custom directory:

```bash
export NOTEBOOKLM_HOME=/custom/path

# All files now go here:
# /custom/path/profiles/<profile>/storage_state.json
# /custom/path/profiles/<profile>/context.json
# /custom/path/profiles/<profile>/browser_profile/
```

**Use cases:**
- Per-project isolation
- Custom storage locations

### NOTEBOOKLM_PROFILE

Selects the active profile without changing the persisted default:

```bash
export NOTEBOOKLM_PROFILE=work
notebooklm list   # Uses ~/.notebooklm/profiles/work/
```

Equivalent to passing `-p work` on every command. The CLI flag takes precedence over the env var.

### NOTEBOOKLM_AUTH_JSON

Provides authentication inline without writing files. Ideal for CI/CD:

```bash
export NOTEBOOKLM_AUTH_JSON='{"cookies":[...]}'
notebooklm list  # Works without any file on disk
```

**Precedence:**
1. `--storage` CLI flag (highest)
2. `NOTEBOOKLM_AUTH_JSON` environment variable
3. Profile-aware path: `$NOTEBOOKLM_HOME/profiles/<profile>/storage_state.json`
4. `~/.notebooklm/profiles/default/storage_state.json` (default)
5. `~/.notebooklm/storage_state.json` (legacy fallback)

**Note:** Cannot run `notebooklm login` when `NOTEBOOKLM_AUTH_JSON` is set.

## CLI Options

### Global Options

| Option | Description | Default |
|--------|-------------|---------|
| `--storage PATH` | Path to storage_state.json | `$NOTEBOOKLM_HOME/profiles/<profile>/storage_state.json` |
| `-p, --profile NAME` | Use a named profile | Active profile or `default` |
| `-v, --verbose` | Enable verbose output | - |
| `--version` | Show version | - |
| `--help` | Show help | - |

### Viewing Configuration

See where your configuration files are located:

```bash
notebooklm status --paths
```

Output:
```
                Configuration Paths
┏━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━┓
┃ File            ┃ Path                                     ┃ Source    ┃
┡━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━┩
│ Profile         │ default                                  │ active    │
│ Home Directory  │ /home/user/.notebooklm                   │ default   │
│ Storage State   │ .../profiles/default/storage_state.json  │           │
│ Context         │ .../profiles/default/context.json        │           │
│ Browser Profile │ .../profiles/default/browser_profile     │           │
└─────────────────┴──────────────────────────────────────────┴───────────┘
```

## Session Management

### Session Lifetime

Authentication sessions are tied to Google's cookie expiration:
- Sessions typically last several days to weeks
- Google may invalidate sessions for security reasons
- Rate limiting or suspicious activity can trigger earlier expiration

### Refreshing Sessions

**Automatic Refresh:** CSRF tokens and session IDs are automatically refreshed when authentication errors are detected. This handles most "session expired" errors transparently.

**Manual Re-authentication:** If your session cookies have fully expired (automatic refresh won't help), re-authenticate:

```bash
notebooklm login
```

### Multiple Accounts

**Profiles (recommended):** Use named profiles to manage multiple Google accounts under a single home directory:

```bash
# Create and authenticate profiles
notebooklm profile create work
notebooklm -p work login
notebooklm -p work list

notebooklm profile create personal
notebooklm -p personal login
notebooklm -p personal list

# Switch the active profile
notebooklm profile switch work
notebooklm list   # Uses work profile

# List all profiles
notebooklm profile list

# Use env var for session-wide override
export NOTEBOOKLM_PROFILE=personal
notebooklm list   # Uses personal profile
```

Each profile stores its own `storage_state.json`, `context.json`, and `browser_profile/` under `~/.notebooklm/profiles/<name>/`.

**Alternative: `NOTEBOOKLM_HOME`** still works for full directory-level isolation:

```bash
export NOTEBOOKLM_HOME=~/.notebooklm-work
notebooklm login
```

**One-off override with `--storage`:**

```bash
notebooklm --storage /path/to/account.json list
```

## CI/CD Configuration

### GitHub Actions (Recommended)

Use `NOTEBOOKLM_AUTH_JSON` for secure, file-free authentication:

```yaml
jobs:
  notebook-task:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install notebooklm-py
        run: pip install notebooklm-py

      - name: List notebooks
        env:
          NOTEBOOKLM_AUTH_JSON: ${{ secrets.NOTEBOOKLM_AUTH_JSON }}
        run: notebooklm list
```

**Benefits:**
- No file writes needed
- Secret stays in memory only
- Clean, simple workflow

### Obtaining the Secret Value

1. Run `notebooklm login` locally
2. Copy the contents of `~/.notebooklm/storage_state.json`
3. Add as a GitHub repository secret named `NOTEBOOKLM_AUTH_JSON`

### Alternative: File-Based Auth

If you prefer file-based authentication:

```yaml
- name: Setup NotebookLM auth
  run: |
    mkdir -p ~/.notebooklm/profiles/default
    echo "${{ secrets.NOTEBOOKLM_AUTH_JSON }}" > ~/.notebooklm/profiles/default/storage_state.json
    chmod 600 ~/.notebooklm/profiles/default/storage_state.json

- name: List notebooks
  run: notebooklm list
```

For profile-specific CI auth:

```yaml
- name: Setup work profile auth
  run: |
    mkdir -p ~/.notebooklm/profiles/work
    echo "${{ secrets.WORK_AUTH_JSON }}" > ~/.notebooklm/profiles/work/storage_state.json
    chmod 600 ~/.notebooklm/profiles/work/storage_state.json

- name: List notebooks (work)
  run: notebooklm -p work list
```

### Session Expiration

CSRF tokens are automatically refreshed during API calls. However, the underlying session cookies still expire. For long-running CI pipelines:
- Update the `NOTEBOOKLM_AUTH_JSON` secret every 1-2 weeks
- Monitor for persistent auth failures (these indicate cookie expiration)

## Debugging

### Enable Verbose Output

Some commands support verbose output via Rich console:

```bash
# Most errors are printed to stderr with details
notebooklm list 2>&1 | cat
```

### Enable RPC Debug Logging

```bash
NOTEBOOKLM_DEBUG_RPC=1 notebooklm list
```

### Check Authentication

Verify your session is working:

```bash
# Should list notebooks or show empty list
notebooklm list

# If you see "Unauthorized" or redirect errors, re-login
notebooklm login
```

### Check Configuration Paths

```bash
# See where files are being read from
notebooklm status --paths
```

### Network Issues

The CLI uses `httpx` for HTTP requests. Common issues:

- **Timeout**: Google's API can be slow; large operations may time out
- **SSL errors**: Ensure your system certificates are up to date
- **Proxy**: Set standard environment variables (`HTTP_PROXY`, `HTTPS_PROXY`) if needed

## Platform Notes

### macOS

Works out of the box. Chromium is downloaded automatically by Playwright.

### Linux

```bash
# Install Playwright dependencies
playwright install-deps chromium

# Then install Chromium
playwright install chromium
```

### Windows

Works with PowerShell or CMD. Use backslashes for paths:

```powershell
notebooklm --storage C:\Users\Name\.notebooklm\storage_state.json list
```

Or set environment variable:

```powershell
$env:NOTEBOOKLM_HOME = "C:\Users\Name\custom-notebooklm"
notebooklm list
```

### WSL

Browser login opens in the Windows host browser. The storage file is saved in the WSL filesystem.

### Headless Servers & Containers

**Playwright is only required for the `notebooklm login` command.** All other operations use standard HTTP requests via `httpx`.

This means you can run notebooklm on headless servers, Docker containers, and CI/CD environments without Playwright—just copy a valid `storage_state.json` or use `NOTEBOOKLM_AUTH_JSON`.

```bash
# On headless machine - no Playwright needed
pip install notebooklm-py

# Copy auth from local machine, or use env var
scp ~/.notebooklm/storage_state.json user@server:~/.notebooklm/
# OR
export NOTEBOOKLM_AUTH_JSON='{"cookies": [...]}'

# All commands work except 'login'
notebooklm list
notebooklm ask "Summarize the sources"
```

# CLI Reference

**Status:** Active
**Last Updated:** 2026-03-13

Complete command reference for the `notebooklm` CLI—providing full programmatic access to all NotebookLM features, including capabilities not exposed in the web UI.

## Command Structure

```
notebooklm [-p PROFILE] [--storage PATH] [--version] [-v] <command> [OPTIONS] [ARGS]
```

**Global Options:**
- `-p, --profile NAME` - Use a named profile (overrides `NOTEBOOKLM_PROFILE` env var)
- `--storage PATH` - Override the default storage location
- `-v, --verbose` - Enable verbose output
- `--version` - Show version and exit
- `--help` - Show help message

**Environment Variables:**
- `NOTEBOOKLM_HOME` - Base directory for all config files (default: `~/.notebooklm`)
- `NOTEBOOKLM_PROFILE` - Active profile name (default: `default`)
- `NOTEBOOKLM_AUTH_JSON` - Inline authentication JSON (for CI/CD, no file writes needed)
- `NOTEBOOKLM_DEBUG_RPC` - Enable RPC debug logging (`1` to enable)

See [Configuration](configuration.md) for details on environment variables and CI/CD setup.

**Command Organization:**
- **Session commands** - Authentication and context management
- **Notebook commands** - CRUD operations on notebooks
- **Chat commands** - Querying and conversation management
- **Grouped commands** - `source`, `artifact`, `agent`, `generate`, `download`, `note`, `share`, `research`, `language`, `skill`, `auth`, `profile`
- **Utility commands** - `metadata`, `doctor`

---

## Quick Reference

### Session Commands

| Command | Description | Example |
|---------|-------------|---------|
| `login` | Authenticate via browser | `notebooklm login` / `notebooklm login --browser msedge` |
| `use <id>` | Set active notebook | `notebooklm use abc123` |
| `status` | Show current context | `notebooklm status` |
| `status --paths` | Show configuration paths | `notebooklm status --paths` |
| `status --json` | Output status as JSON | `notebooklm status --json` |
| `clear` | Clear current context | `notebooklm clear` |
| `auth check` | Diagnose authentication issues | `notebooklm auth check` |
| `auth check --test` | Validate with network test | `notebooklm auth check --test` |
| `auth check --json` | Output as JSON | `notebooklm auth check --json` |
| `doctor` | Check environment health | `notebooklm doctor` |
| `doctor --fix` | Auto-fix detected issues | `notebooklm doctor --fix` |
| `doctor --json` | Output diagnostics as JSON | `notebooklm doctor --json` |

### Profile Commands (`notebooklm profile <cmd>`)

| Command | Description | Example |
|---------|-------------|---------|
| `list` | List all profiles | `notebooklm profile list` |
| `create <name>` | Create a new profile | `notebooklm profile create work` |
| `switch <name>` | Set the active profile | `notebooklm profile switch work` |
| `delete <name>` | Delete a profile | `notebooklm profile delete old` |
| `rename <old> <new>` | Rename a profile | `notebooklm profile rename old new` |

### Language Commands (`notebooklm language <cmd>`)

| Command | Description | Example |
|---------|-------------|---------|
| `list` | List all supported languages | `notebooklm language list` |
| `get` | Show current language setting | `notebooklm language get` |
| `get --local` | Show local config only (skip server sync) | `notebooklm language get --local` |
| `set <code>` | Set language for artifact generation | `notebooklm language set zh_Hans` |
| `set <code> --local` | Set local config only (skip server sync) | `notebooklm language set ja --local` |

**Note:** Language is a **GLOBAL** setting that affects all notebooks in your account.

### Notebook Commands

| Command | Description | Example |
|---------|-------------|---------|
| `list` | List all notebooks | `notebooklm list` |
| `create <title>` | Create notebook | `notebooklm create "Research"` |
| `delete <id>` | Delete notebook | `notebooklm delete abc123` |
| `rename <title>` | Rename current notebook | `notebooklm rename "New Title"` |
| `summary` | Get AI summary | `notebooklm summary` |

### Chat Commands

| Command | Description | Example |
|---------|-------------|---------|
| `ask <question>` | Ask a question | `notebooklm ask "What is this about?"` |
| `ask -s <id>` | Ask using specific sources | `notebooklm ask "Summarize" -s src1 -s src2` |
| `ask --json` | Get answer with source references | `notebooklm ask "Explain X" --json` |
| `ask --save-as-note` | Save response as a note | `notebooklm ask "Explain X" --save-as-note` |
| `ask --save-as-note --note-title` | Save response with custom note title | `notebooklm ask "Explain X" --save-as-note --note-title "Title"` |
| `configure` | Set persona/mode | `notebooklm configure --mode learning-guide` |
| `history` | View conversation history | `notebooklm history` |
| `history --clear` | Clear local conversation cache | `notebooklm history --clear` |
| `history --save` | Save history as a note | `notebooklm history --save` |
| `history --save --note-title` | Save history with custom title | `notebooklm history --save --note-title "Summary"` |
| `history --show-all` | Show full Q&A content (not preview) | `notebooklm history --show-all` |

### Source Commands (`notebooklm source <cmd>`)

Supported source types: URLs, YouTube videos, files (PDF, text, Markdown, Word, audio, video, images), Google Drive documents, and pasted text.

| Command | Arguments | Options | Example |
|---------|-----------|---------|---------|
| `list` | - | - | `source list` |
| `add <content>` | URL/file/text | - | `source add "https://..."` |
| `add-drive <id> <title>` | Drive file ID | - | `source add-drive abc123 "Doc"` |
| `add-research <query>` | Search query | `--mode [fast|deep]`, `--from [web|drive]`, `--import-all`, `--no-wait` | `source add-research "AI" --mode deep --no-wait` |
| `get <id>` | Source ID | - | `source get src123` |
| `fulltext <id>` | Source ID | `--json`, `-o FILE` | `source fulltext src123 -o content.txt` |
| `guide <id>` | Source ID | `--json` | `source guide src123` |
| `rename <id> <title>` | Source ID, new title | - | `source rename src123 "New Name"` |
| `refresh <id>` | Source ID | - | `source refresh src123` |
| `delete <id>` | Source ID | - | `source delete src123` |
| `delete-by-title <title>` | Exact source title | - | `source delete-by-title "My Source"` |
| `wait <id>` | Source ID | `--timeout`, `--interval` | `source wait src123` |

`source delete <id>` accepts only full source IDs or unique partial-ID prefixes. To delete by exact source title, use `source delete-by-title "<title>"`.

### Research Commands (`notebooklm research <cmd>`)

| Command | Arguments | Options | Example |
|---------|-----------|---------|---------|
| `status` | - | `--json` | `research status` |
| `wait` | - | `--timeout`, `--interval`, `--import-all`, `--json` | `research wait --import-all` |

### Generate Commands (`notebooklm generate <type>`)

All generate commands support:
- `--source/-s` to select specific sources (repeatable)
- `--json` for machine-readable output (returns `task_id` and `status`)
- `--language` to override output language (defaults to config or 'en')
- `--retry N` to automatically retry on rate limits with exponential backoff

| Command | Options | Example |
|---------|---------|---------|
| `audio [description]` | `--format [deep-dive\|brief\|critique\|debate]`, `--length [short\|default\|long]`, `--wait` | `generate audio "Focus on history"` |
| `video [description]` | `--format [explainer\|brief\|cinematic]`, `--style [auto\|classic\|whiteboard\|kawaii\|anime\|watercolor\|retro-print\|heritage\|paper-craft]`, `--wait` | `generate video "Explainer for kids"` |
| `cinematic-video [description]` | Alias for `video --format cinematic`; supports the same options | `generate cinematic-video "Documentary about quantum physics"` |
| `slide-deck [description]` | `--format [detailed\|presenter]`, `--length [default\|short]`, `--wait` | `generate slide-deck` |
| `revise-slide <description>` | `-a/--artifact <id>` (required), `--slide N` (required), `--wait` | `generate revise-slide "Move title up" --artifact <id> --slide 0` |
| `quiz [description]` | `--difficulty [easy\|medium\|hard]`, `--quantity [fewer\|standard\|more]`, `--wait` | `generate quiz --difficulty hard` |
| `flashcards [description]` | `--difficulty [easy\|medium\|hard]`, `--quantity [fewer\|standard\|more]`, `--wait` | `generate flashcards` |
| `infographic [description]` | `--orientation [landscape\|portrait\|square]`, `--detail [concise\|standard\|detailed]`, `--style [auto\|sketch-note\|professional\|bento-grid\|editorial\|instructional\|bricks\|clay\|anime\|kawaii\|scientific]`, `--wait` | `generate infographic` |
| `data-table <description>` | `--wait` | `generate data-table "compare concepts"` |
| `mind-map` | *(sync, no wait needed)* | `generate mind-map` |
| `report [description]` | `--format [briefing-doc\|study-guide\|blog-post\|custom]`, `--append "extra instructions"`, `--wait` | `generate report --format study-guide` |

### Artifact Commands (`notebooklm artifact <cmd>`)

| Command | Arguments | Options | Example |
|---------|-----------|---------|---------|
| `list` | - | `--type` | `artifact list --type audio` |
| `get <id>` | Artifact ID | - | `artifact get art123` |
| `rename <id> <title>` | Artifact ID, title | - | `artifact rename art123 "Title"` |
| `delete <id>` | Artifact ID | - | `artifact delete art123` |
| `export <id>` | Artifact ID | `--type [docs|sheets]`, `--title` | `artifact export art123 --type sheets` |
| `poll <task_id>` | Task ID | - | `artifact poll task123` |
| `wait <id>` | Artifact ID | `--timeout`, `--interval` | `artifact wait art123` |
| `suggestions` | - | `-s/--source`, `--json` | `artifact suggestions` |

### Download Commands (`notebooklm download <type>`)

| Command | Arguments | Options | Example |
|---------|-----------|---------|---------|
| `audio [path]` | Output path | `-a/--artifact`, `--all`, `--latest`, `--name`, `--force`, `--dry-run` | `download audio --all` |
| `video [path]` | Output path | `-a/--artifact`, `--all`, `--latest`, `--name`, `--force`, `--dry-run` | `download video --latest` |
| `cinematic-video [path]` | Output path | Alias for `download video`; same options as `video` | `download cinematic-video ./documentary.mp4` |
| `slide-deck [path]` | Output path      | `-a/--artifact`, `--all`, `--latest`, `--name`, `--force`, `--dry-run`, `--format [pdf\|pptx]` | `download slide-deck ./slides.pdf` |
| `infographic [path]` | Output path | `-a/--artifact`, `--all`, `--latest`, `--name`, `--force`, `--dry-run` | `download infographic ./info.png` |
| `report [path]` | Output path | `-a/--artifact`, `--all`, `--latest`, `--name`, `--force`, `--dry-run` | `download report ./report.md` |
| `mind-map [path]` | Output path | `-a/--artifact`, `--all`, `--latest`, `--name`, `--force`, `--dry-run` | `download mind-map ./map.json` |
| `data-table [path]` | Output path | `-a/--artifact`, `--all`, `--latest`, `--name`, `--force`, `--dry-run` | `download data-table ./data.csv` |
| `quiz [path]` | Output path | `-n/--notebook`, `-a/--artifact`, `--format` (json/markdown/html) | `download quiz --format markdown quiz.md` |
| `flashcards [path]` | Output path | `-n/--notebook`, `-a/--artifact`, `--format` (json/markdown/html) | `download flashcards cards.json` |

### Note Commands (`notebooklm note <cmd>`)

| Command | Arguments | Options | Example |
|---------|-----------|---------|---------|
| `list` | - | - | `note list` |
| `create <content>` | Note content | - | `note create "My notes..."` |
| `get <id>` | Note ID | - | `note get note123` |
| `save <id>` | Note ID | `--title`, `--content` | `note save note123 --title "Updated title"` |
| `rename <id> <title>` | Note ID, title | - | `note rename note123 "Title"` |
| `delete <id>` | Note ID | - | `note delete note123` |

### Metadata Command

Export notebook metadata and a simplified source list.

```bash
notebooklm metadata [OPTIONS]
```

**Options:**
- `-n, --notebook ID` - Specify notebook (uses current if not set)
- `--json` - Output as JSON for scripts

**Examples:**
```bash
notebooklm metadata
notebooklm metadata -n abc123 --json
```

### Skill Commands (`notebooklm skill <cmd>`)

Manage NotebookLM agent skill integration.

| Command | Description | Example |
|---------|-------------|---------|
| `install` | Install/update the skill for `claude`, `.agents`, or both | `skill install --target all` |
| `status` | Check installed targets and version info | `skill status --scope project` |
| `uninstall` | Remove one or more installed targets | `skill uninstall --target agents` |
| `show` | Display the packaged skill or an installed target | `skill show --target source` |

Defaults:

- `skill install` uses `--scope user --target all`
- `claude` maps to `.claude/skills/notebooklm/SKILL.md`
- `agents` maps to `.agents/skills/notebooklm/SKILL.md`
- `show --target source` prints the canonical packaged skill file

The packaged wheel includes the repo-root `SKILL.md`, so the same skill content powers `notebooklm skill install`, GitHub discovery, and `npx skills add teng-lin/notebooklm-py`.

Codex does not use the `skill` subcommand. In this repository it reads the root [`AGENTS.md`](../AGENTS.md) file and invokes the `notebooklm` CLI or Python API directly.

### Agent Commands (`notebooklm agent <cmd>`)

Show bundled instructions for supported agent environments.

| Command | Description | Example |
|---------|-------------|---------|
| `show codex` | Print the Codex repository guidance | `agent show codex` |
| `show claude` | Print the bundled Claude Code skill template | `agent show claude` |

`agent show codex` prefers the root [`AGENTS.md`](../AGENTS.md) file when running from a source checkout, so the CLI mirrors the same instructions Codex sees in the repository.

### Features Beyond the Web UI

These CLI capabilities are not available in NotebookLM's web interface:

| Feature | Command | Description |
|---------|---------|-------------|
| **Batch downloads** | `download <type> --all` | Download all artifacts of a type at once |
| **Quiz/Flashcard export** | `download quiz --format json` | Export as JSON, Markdown, or HTML |
| **Mind map extraction** | `download mind-map` | Export hierarchical JSON for visualization tools |
| **Data table export** | `download data-table` | Download structured tables as CSV |
| **Slide deck as PPTX** | `download slide-deck --format pptx` | Download as editable .pptx (web UI only offers PDF) |
| **Slide revision** | `generate revise-slide "prompt" --artifact <id> --slide N` | Modify individual slides with a natural-language prompt |
| **Report template append** | `generate report --format study-guide --append "..."` | Append instructions to built-in templates |
| **Source fulltext** | `source fulltext <id>` | Retrieve the indexed text content of any source |
| **Save chat to note** | `ask "..." --save-as-note` / `history --save` | Save Q&A answers or full conversation as notebook notes |
| **Programmatic sharing** | `share` commands | Manage permissions without the UI |

---

## Detailed Command Reference

### Session: `login`

Authenticate with Google NotebookLM via browser.

```bash
notebooklm login [OPTIONS]
```

Opens a Chromium browser with a persistent profile. Log in to your Google account, then press Enter in the terminal to save the session.

**Options:**
- `--storage PATH` - Where to save storage_state.json (default: `$NOTEBOOKLM_HOME/storage_state.json`)
- `--browser [chromium|msedge]` - Browser to use for login (default: `chromium`). Use `msedge` for Microsoft Edge.

**Examples:**
```bash
# Default (Chromium)
notebooklm login

# Use Microsoft Edge (for orgs that require Edge for SSO)
notebooklm login --browser msedge
```

### Session: `use`

Set the active notebook for subsequent commands.

```bash
notebooklm use <notebook_id>
```

Supports partial ID matching:
```bash
notebooklm use abc  # Matches abc123def456...
```

### Session: `status`

Show current context (active notebook and conversation).

```bash
notebooklm status [OPTIONS]
```

**Options:**
- `--paths` - Show resolved configuration file paths
- `--json` - Output as JSON (useful for scripts)

**Examples:**
```bash
# Basic status
notebooklm status

# Show where config files are located
notebooklm status --paths
# Output shows home_dir, storage_path, context_path, browser_profile_dir

# JSON output for scripts
notebooklm status --json
```

**With `--paths`:**
```
                Configuration Paths
┏━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━┓
┃ File            ┃ Path                         ┃ Source          ┃
┡━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━━━┩
│ Home Directory  │ /home/user/.notebooklm      │ default         │
│ Storage State   │ .../storage_state.json      │                 │
│ Context         │ .../context.json            │                 │
│ Browser Profile │ .../browser_profile         │                 │
└─────────────────┴──────────────────────────────┴─────────────────┘
```

### Language: `list`, `get`, `set`

Manage the output language for artifact generation (audio, video, etc.).

**Important:** Language is a **GLOBAL** setting that affects all notebooks in your account.

```bash
# List all supported languages with native names
notebooklm language list

# Show current language setting (syncs from server)
notebooklm language get

# Set language to Simplified Chinese
notebooklm language set zh_Hans

# Set language to Japanese
notebooklm language set ja
```

**Options for `get`:**
- `--local` - Skip server sync, show local config only
- `--json` - Output as JSON

**Options for `set`:**
- `--local` - Save to local config only, skip server sync
- `--json` - Output as JSON

**Common language codes:**
| Code | Language |
|------|----------|
| `en` | English |
| `zh_Hans` | 中文（简体） - Simplified Chinese |
| `zh_Hant` | 中文（繁體） - Traditional Chinese |
| `ja` | 日本語 - Japanese |
| `ko` | 한국어 - Korean |
| `es` | Español - Spanish |
| `fr` | Français - French |
| `de` | Deutsch - German |
| `pt_BR` | Português (Brasil) - Brazilian Portuguese |

Run `notebooklm language list` for all 80+ supported languages.

### Share: `status`, `public`, `view-level`, `add`, `update`, `remove`

Manage notebook sharing settings and user permissions.

```bash
# Show current sharing status and shared users
notebooklm share status

# Enable public link sharing (anyone with link can view)
notebooklm share public --enable

# Disable public sharing
notebooklm share public --disable

# Set what viewers can access
notebooklm share view-level full   # Full notebook (chat, sources, notes)
notebooklm share view-level chat   # Chat interface only

# Share with specific users
notebooklm share add user@example.com                        # Add as viewer (default)
notebooklm share add user@example.com --permission editor    # Add as editor
notebooklm share add user@example.com -m "Check this out!"   # With message
notebooklm share add user@example.com --no-notify            # Skip email notification

# Update user permission
notebooklm share update user@example.com --permission editor

# Remove user access
notebooklm share remove user@example.com
notebooklm share remove user@example.com -y   # Skip confirmation
```

**Options (all commands):**
- `-n, --notebook ID` - Specify notebook (uses current if not set, supports partial IDs)
- `--json` - Output as JSON

**Permission levels:**
| Level | Access |
|-------|--------|
| `viewer` | Read-only access (default) |
| `editor` | Can edit notebook content |

**View levels:**
| Level | Viewers can see |
|-------|-----------------|
| `full` | Chat, sources, and notes |
| `chat` | Chat interface only |

### Session: `auth check`

Diagnose authentication issues by validating storage file, cookies, and optionally testing token fetch.

```bash
notebooklm auth check [OPTIONS]
```

**Options:**
- `--test` - Also test token fetch from NotebookLM (makes network request)
- `--json` - Output as JSON (useful for scripts)

**Examples:**
```bash
# Quick local validation
notebooklm auth check

# Full validation with network test
notebooklm auth check --test

# JSON output for automation
notebooklm auth check --json
```

**Checks performed:**
1. Storage file exists and is readable
2. JSON structure is valid
3. Required cookies (SID) are present
4. Cookie domains are correct (.google.com vs regional)
5. (With `--test`) Token fetch succeeds

**Output shows:**
- Authentication source (file path or environment variable)
- Which cookies were found and from which domains
- Detailed cookie breakdown by domain (highlighting key auth cookies)
- Token lengths when using `--test`

**Use cases:**
- Debug "Not logged in" errors
- Verify auth setup in CI/CD environments
- Check if cookies are from correct domain (regional vs .google.com)
- Diagnose NOTEBOOKLM_AUTH_JSON environment variable issues

### Source: `add-research`

Perform AI-powered research and add discovered sources to the notebook.

```bash
notebooklm source add-research <query> [OPTIONS]
```

**Options:**
- `--mode [fast|deep]` - Research depth (default: fast)
- `--from [web|drive]` - Search source (default: web)
- `--import-all` - Automatically import all found sources (works with blocking mode)
- `--no-wait` - Start research and return immediately (non-blocking)

**Examples:**
```bash
# Fast web research (blocking)
notebooklm source add-research "Quantum computing basics"

# Deep research into Google Drive
notebooklm source add-research "Project Alpha" --from drive --mode deep

# Non-blocking deep research for agent workflows
notebooklm source add-research "AI safety papers" --mode deep --no-wait
```

### Research: `status`

Check research status for the current notebook (non-blocking).

```bash
notebooklm research status [OPTIONS]
```

**Options:**
- `-n, --notebook ID` - Notebook ID (uses current if not set)
- `--json` - Output as JSON

**Output states:**
- **No research running** - No active research session
- **Research in progress** - Deep research is still running
- **Research completed** - Shows query, found sources, and summary

**Examples:**
```bash
# Check status
notebooklm research status

# JSON output for scripts/agents
notebooklm research status --json
```

### Research: `wait`

Wait for research to complete (blocking).

```bash
notebooklm research wait [OPTIONS]
```

**Options:**
- `-n, --notebook ID` - Notebook ID (uses current if not set)
- `--timeout SECONDS` - Maximum seconds to wait (default: 300)
- `--interval SECONDS` - Seconds between status checks (default: 5)
- `--import-all` - Import all found sources when done
- `--json` - Output as JSON

**Examples:**
```bash
# Basic wait
notebooklm research wait

# Wait longer for deep research
notebooklm research wait --timeout 600

# Wait and auto-import sources
notebooklm research wait --import-all

# JSON output for agent workflows
notebooklm research wait --json --import-all
```

**Use case:** Primarily for LLM agents that need to wait for non-blocking deep research started with `source add-research --no-wait`.

### Generate: `audio`

Generate an audio overview (podcast).

```bash
notebooklm generate audio [description] [OPTIONS]
```

**Options:**
- `--format [deep-dive|brief|critique|debate]` - Podcast format (default: deep-dive)
- `--length [short|default|long]` - Duration (default: default)
- `--language LANG` - Language code (default: en)
- `-s, --source ID` - Use specific source(s) (repeatable, uses all if not specified)
- `--wait` - Wait for generation to complete
- `--json` - Output as JSON (returns `task_id` and `status`)

**Examples:**
```bash
# Basic podcast (starts async, returns immediately)
notebooklm generate audio

# Debate format with custom instructions
notebooklm generate audio "Compare the two main viewpoints" --format debate

# Generate and wait for completion
notebooklm generate audio "Focus on key points" --wait

# Generate using only specific sources
notebooklm generate audio -s src_abc -s src_def

# JSON output for scripting/automation
notebooklm generate audio --json
# Output: {"task_id": "abc123...", "status": "pending"}
```

### Generate: `video`

Generate a video overview.

```bash
notebooklm generate video [description] [OPTIONS]
```

**Options:**
- `--format [explainer|brief]` - Video format
- `--style [auto|classic|whiteboard|kawaii|anime|watercolor|retro|heritage|paper-craft]` - Visual style
- `--language LANG` - Language code
- `-s, --source ID` - Use specific source(s) (repeatable, uses all if not specified)
- `--wait` - Wait for generation to complete
- `--json` - Output as JSON (returns `task_id` and `status`)

**Examples:**
```bash
# Kid-friendly explainer
notebooklm generate video "Explain for 5 year olds" --style kawaii

# Professional style
notebooklm generate video --style classic --wait

# Generate from specific sources only
notebooklm generate video -s src_123 -s src_456

# JSON output for scripting/automation
notebooklm generate video --json
```

### Generate: `revise-slide`

Revise an individual slide in an existing slide deck using a natural-language prompt.

```bash
notebooklm generate revise-slide <description> --artifact <id> --slide N [OPTIONS]
```

**Required Options:**
- `-a, --artifact ID` - The slide deck artifact ID to revise
- `--slide N` - Zero-based index of the slide to revise (0 = first slide)

**Optional:**
- `--wait` - Wait for revision to complete
- `--json` - Machine-readable output

**Examples:**
```bash
# Revise the first slide
notebooklm generate revise-slide "Move the title up" --artifact art123 --slide 0

# Revise the fourth slide and wait for completion
notebooklm generate revise-slide "Remove taxonomy table" --artifact art123 --slide 3 --wait
```

**Note:** The slide deck must already be fully generated before using `revise-slide`. Use `artifact list` to find the artifact ID.

---

### Generate: `report`

Generate a text report (briefing doc, study guide, blog post, or custom).

```bash
notebooklm generate report [description] [OPTIONS]
```

**Options:**
- `--format [briefing-doc|study-guide|blog-post|custom]` - Report format (default: briefing-doc)
- `--append TEXT` - Append extra instructions to the built-in prompt (no effect with `--format custom`)
- `-s, --source ID` - Use specific source(s) (repeatable, uses all if not specified)
- `--wait` - Wait for generation to complete
- `--json` - Output as JSON

**Examples:**
```bash
notebooklm generate report --format study-guide
notebooklm generate report "Executive summary for stakeholders" --format briefing-doc

# Generate report from specific sources
notebooklm generate report --format study-guide -s src_001 -s src_002

# Custom report with description (auto-selects custom format)
notebooklm generate report "Create a white paper analyzing the key trends"

# Append instructions to a built-in format
notebooklm generate report --format study-guide --append "Target audience: beginners"
notebooklm generate report --format briefing-doc --append "Focus on AI trends, keep it under 2 pages"
```

### Download: `audio`, `video`, `slide-deck`, `infographic`, `report`, `mind-map`, `data-table`

Download generated artifacts to your local machine.

```bash
notebooklm download <type> [OUTPUT_PATH] [OPTIONS]
```

**Artifact Types and Output Formats:**

| Type | Default Extension | Description |
|------|-------------------|-------------|
| `audio` | `.mp4` | Audio overview (podcast) in MP4 container |
| `video` | `.mp4` | Video overview |
| `slide-deck` | `.pdf` or `.pptx` | Slide deck as PDF (default) or PowerPoint |
| `infographic` | `.png` | Infographic image |
| `report` | `.md` | Report as Markdown (Briefing Doc, Study Guide, etc.) |
| `mind-map` | `.json` | Mind map as JSON tree structure |
| `data-table` | `.csv` | Data table as CSV (UTF-8 with BOM for Excel) |

**Options:**
- `--all` - Download all artifacts of this type
- `--latest` - Download only the most recent artifact (default if no ID/name provided)
- `--earliest` - Download only the oldest artifact
- `--name NAME` - Download artifact with matching title (supports partial matches)
- `-a, --artifact ID` - Select specific artifact by ID (supports partial IDs)
- `--dry-run` - Show what would be downloaded without actually downloading
- `--force` - Overwrite existing files
- `--no-clobber` - Skip if file already exists (default)
- `--format [pdf|pptx]` - Slide deck format (slide-deck command only, default: pdf)
- `--json` - Output result in JSON format

**Examples:**
```bash
# Download the latest podcast
notebooklm download audio ./podcast.mp3

# Download all infographics
notebooklm download infographic --all

# Download a specific slide deck by name
notebooklm download slide-deck --name "Final Presentation"

# Download slide deck as PPTX (editable PowerPoint)
notebooklm download slide-deck --format pptx

# Preview a batch download
notebooklm download audio --all --dry-run

# Download a report as markdown
notebooklm download report ./study-guide.md

# Download mind map as JSON
notebooklm download mind-map ./concept-map.json

# Download data table as CSV (opens in Excel)
notebooklm download data-table ./research-data.csv
```

### Download: `quiz`, `flashcards`

Download quiz questions or flashcard decks in various formats.

```bash
notebooklm download quiz [OUTPUT_PATH] [OPTIONS]
notebooklm download flashcards [OUTPUT_PATH] [OPTIONS]
```

**Options:**
- `-n, --notebook ID` - Notebook ID (uses current context if not set)
- `--format FORMAT` - Output format: `json` (default), `markdown`, or `html`
- `-a, --artifact ID` - Select specific artifact by ID

**Output Formats:**
- **JSON** - Structured data preserving full API fields (answerOptions, rationale, isCorrect, hint)
- **Markdown** - Human-readable format with checkboxes for correct answers
- **HTML** - Raw HTML as returned from NotebookLM

**Examples:**
```bash
# Download quiz as JSON
notebooklm download quiz quiz.json

# Download quiz as markdown
notebooklm download quiz --format markdown quiz.md

# Download flashcards as JSON (normalizes f/b keys to front/back)
notebooklm download flashcards cards.json

# Download flashcards as markdown
notebooklm download flashcards --format markdown cards.md

# Download flashcards as raw HTML
notebooklm download flashcards --format html cards.html
```

---

## Common Workflows

### Research → Podcast

Find information on a topic and create a podcast about it.

```bash
# 1. Create a notebook for this research
notebooklm create "Climate Change Research"
# Output: Created notebook: abc123

# 2. Set as active
notebooklm use abc123

# 3. Add a starting source
notebooklm source add "https://en.wikipedia.org/wiki/Climate_change"

# 4. Research more sources automatically (blocking - waits up to 5 min)
notebooklm source add-research "climate change policy 2024" --mode deep --import-all

# 5. Generate a podcast
notebooklm generate audio "Focus on policy solutions and future outlook" --format debate --wait

# 6. Download the result
notebooklm download audio ./climate-podcast.mp3
```

### Research → Podcast (Non-blocking with Subagent)

For LLM agents, use non-blocking mode to avoid timeout:

```bash
# 1-3. Create notebook and add initial source (same as above)
notebooklm create "Climate Change Research"
notebooklm use abc123
notebooklm source add "https://en.wikipedia.org/wiki/Climate_change"

# 4. Start deep research (non-blocking)
notebooklm source add-research "climate change policy 2024" --mode deep --no-wait
# Returns immediately

# 5. In a subagent, wait for research and import
notebooklm research wait --import-all --timeout 300
# Blocks until complete, then imports sources

# 6. Continue with podcast generation...
```

**Research commands:**
- `research status` - Check if research is in progress, completed, or not running
- `research wait --import-all` - Block until research completes, then import sources

### Document Analysis → Study Materials

Upload documents and create study materials.

```bash
# 1. Create notebook
notebooklm create "Exam Prep"
notebooklm use <id>

# 2. Add your documents
notebooklm source add "./textbook-chapter.pdf"
notebooklm source add "./lecture-notes.pdf"

# 3. Get a summary
notebooklm summary

# 4. Generate study materials
notebooklm generate quiz --difficulty hard --wait
notebooklm generate flashcards --wait
notebooklm generate report --format study-guide --wait

# 5. Ask specific questions
notebooklm ask "Explain the key concepts in chapter 3"
notebooklm ask "What are the most likely exam topics?"
```

### YouTube → Quick Summary

Turn a YouTube video into notes.

```bash
# 1. Create notebook and add video
notebooklm create "Video Notes"
notebooklm use <id>
notebooklm source add "https://www.youtube.com/watch?v=VIDEO_ID"

# 2. Get summary
notebooklm summary

# 3. Ask questions
notebooklm ask "What are the main points?"
notebooklm ask "Create bullet point notes"

# 4. Generate a quick briefing doc
notebooklm generate report --format briefing-doc --wait
```

### Bulk Import

Add multiple sources at once.

```bash
# Set active notebook
notebooklm use <id>

# Add multiple URLs
notebooklm source add "https://example.com/article1"
notebooklm source add "https://example.com/article2"
notebooklm source add "https://example.com/article3"

# Add multiple local files (use a loop)
for f in ./papers/*.pdf; do
  notebooklm source add "$f"
done
```

---

## Tips for LLM Agents

When using this CLI programmatically:

1. **Two ways to specify notebooks**: Either use `notebooklm use <id>` to set context, OR pass `-n <id>` directly to commands. Most commands support `-n/--notebook` as an explicit override.

2. **Generation commands are async by default** (except mind-map):
   - `mind-map`: Synchronous, completes instantly (no `--wait` option)
   - All others: Return immediately with task ID (default: `--no-wait`)

   Avoid `--wait` for LLM agents—all async operations can take minutes to 30+ minutes. Use `artifact wait <id>` in a background task or inform the user to check back later.

3. **Partial IDs work**: `notebooklm use abc` matches any notebook ID starting with "abc".

4. **Check status**: Use `notebooklm status` to see the current active notebook and conversation.

5. **Auto-detection**: `source add` auto-detects content type:
   - URLs starting with `http` → web source
   - YouTube URLs → video transcript extraction
   - File paths → file upload (PDF, text, Markdown, Word, audio, video, images)

6. **Error handling**: Commands exit with non-zero status on failure. Check stderr for error messages.

7. **Deep research**: Use `--no-wait` with `source add-research --mode deep` to avoid blocking. Then use `research wait --import-all` in a subagent to wait for completion.