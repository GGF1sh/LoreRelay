import os
import sys
import json
import urllib.request

# Configuration for LM Studio
API_URL = "http://localhost:1234/v1/chat/completions"
MODEL_ID = "qwen2.5-coder-14b-instruct"

def call_qwen(prompt_text):
    headers = {
        "Content-Type": "application/json"
    }
    data = {
        "model": MODEL_ID,
        "messages": [
            {"role": "user", "content": prompt_text}
        ],
        "temperature": 0.2
    }
    
    req = urllib.request.Request(API_URL, data=json.dumps(data).encode("utf-8"), headers=headers)
    try:
        print(f"Connecting to LM Studio ({API_URL}) using model '{MODEL_ID}'...")
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return res_data["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"Error connecting to LM Studio: {e}", file=sys.stderr)
        return None

def main():
    if len(sys.argv) < 3:
        print("Usage: python scripts/call_local_coder.py <task_number> <output_file>", file=sys.stderr)
        sys.exit(1)
        
    task_num = sys.argv[1]
    output_path = sys.argv[2]
    
    # Read AGENT_PROMPTS_LIVING_WORLD.md
    prompts_file = os.path.join("docs", "AGENT_PROMPTS_LIVING_WORLD.md")
    if not os.path.exists(prompts_file):
        print(f"Prompts file not found: {prompts_file}", file=sys.stderr)
        sys.exit(1)
        
    with open(prompts_file, "r", encoding="utf-8") as f:
        content = f.read()
        
    # Extract the requested TASK block
    task_header = f"## TASK {task_num}"
    if task_header not in content:
        print(f"Task {task_num} not found in {prompts_file}", file=sys.stderr)
        sys.exit(1)
        
    # Parse the prompt block between ``` and ```
    start_idx = content.find(task_header)
    block_start = content.find("```", start_idx)
    if block_start == -1:
        print(f"Could not find code block for Task {task_num}", file=sys.stderr)
        sys.exit(1)
    
    block_end = content.find("```", block_start + 3)
    if block_end == -1:
        print(f"Could not find end of code block for Task {task_num}", file=sys.stderr)
        sys.exit(1)
        
    prompt_text = content[block_start+3:block_end].strip()
    
    # Prepend the safety header rules
    header_start = content.find("## 監督（Antigravity 等）への常設ヘッダー")
    header_block_start = content.find("```", header_start)
    header_block_end = content.find("```", header_block_start + 3)
    header_text = content[header_block_start+3:header_block_end].strip()
    
    full_prompt = f"{header_text}\n\n=== TASK TO EXECUTE ===\n\n{prompt_text}"
    
    result = call_qwen(full_prompt)
    if result:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as out_f:
            out_f.write(result)
        print(f"Successfully saved Qwen output to: {output_path}")
    else:
        print("Failed to get response from local coder.")
        sys.exit(1)

if __name__ == "__main__":
    main()
