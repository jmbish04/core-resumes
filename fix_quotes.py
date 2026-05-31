import os

docs_dir = "/app/core-resumes/src/frontend/content/docs"

for root, _, files in os.walk(docs_dir):
    for file in files:
        if not file.endswith(".md"): continue
        path = os.path.join(root, file)

        with open(path, "r") as f:
            content = f.read()

        new_content = content.replace('date_last_updated: 2026-05-31', 'date_last_updated: "2026-05-31"')

        with open(path, "w") as f:
            f.write(new_content)
