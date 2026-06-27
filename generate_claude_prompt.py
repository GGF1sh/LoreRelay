import os, glob

output_file = 'CLAUDE_CHARACTER_UI_PROMPT.md'
prompt = """# Context
I am developing an AI-driven Text Adventure / Game Master UI as a VSCode Extension called "LoreRelay".
The UI is a webview using HTML, Vanilla CSS, and Vanilla JavaScript.
I want you to act as an Expert UI/UX Designer and Frontend Engineer (Claude 3.5 Sonnet / 3.7 Sonnet level).

## Objective
1. **Add a "Character Creator / Editor" UI**:
   - Please design and implement a new modal or panel in the UI to create and edit characters.
   - **Requirements:**
     - Avatar image upload area & "Generate with ComfyUI" button.
     - Character profile/setting text areas (Name, Description, Personality, Scenario, etc.).
     - Dynamic Parameter inputs (Stats/Attributes that can be toggled by Game Rules).
     - Ability to upload/manage sprite expressions (multiple images for different emotions).
     - A "Save" button that outputs this character data. Provide the UI logic and hook `vscode.postMessage({ type: 'saveCharacter', data: payload })` so the backend can generate a SillyTavern-compatible V2/V3 Character Card (PNG with embedded JSON) or a pure JSON file.
2. **Refactor and Polish Existing UI**:
   - Review the existing UI code provided below.
   - Feel free to improve the design to be more modern, hacker-like, beautiful, and intuitive.
   - You don't need to rewrite the entire backend logic; focus on the HTML structure, CSS styling, and frontend UI interactions.

---
## Existing Codebase

Below is the current frontend codebase (HTML, CSS, JS) for your reference.

"""

with open(output_file, 'w', encoding='utf-8') as out:
    out.write(prompt)
    
    # Read index.html
    out.write('### webview/index.html\n```html\n')
    out.write(open('webview/index.html', encoding='utf-8').read())
    out.write('\n```\n\n')

    # Read all CSS
    for css_file in sorted(glob.glob('webview/styles/*.css')):
        out.write(f'### {css_file}\n```css\n')
        out.write(open(css_file, encoding='utf-8').read())
        out.write('\n```\n\n')

    # Read all JS
    for js_file in sorted(glob.glob('webview/modules/*.js')):
        out.write(f'### {js_file}\n```javascript\n')
        out.write(open(js_file, encoding='utf-8').read())
        out.write('\n```\n\n')

print(f'Successfully created {output_file}')
