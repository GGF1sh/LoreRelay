#!/usr/bin/env python3
"""
Dice Roller for Text Adventure GM
Usage: python dice.py <NdX>
  Examples:
    python dice.py 1d6   -> 4
    python dice.py 2d6   -> 9 [4+5]
    python dice.py 1d20  -> 17
    python dice.py 3d10  -> 22 [8+7+7]
"""
import sys
import random


def roll(notation: str) -> tuple[int, list[int]]:
    """Roll dice from NdX notation. Returns (total, [individual_results])."""
    notation = notation.strip().lower()
    if 'd' not in notation:
        raise ValueError(f"Invalid notation: '{notation}'. Use format like 1d6, 2d10, etc.")
    
    parts = notation.split('d')
    count = int(parts[0]) if parts[0] else 1
    sides = int(parts[1])
    
    if count < 1 or count > 100:
        raise ValueError("Dice count must be 1-100.")
    if sides < 2 or sides > 10000:
        raise ValueError("Dice sides must be 2-10000.")
    
    results = [random.randint(1, sides) for _ in range(count)]
    return sum(results), results


def main():
    if len(sys.argv) < 2:
        print("Usage: python dice.py <NdX>", flush=True)
        sys.exit(1)
    
    notation = sys.argv[1]
    try:
        total, results = roll(notation)
    except (ValueError, IndexError) as e:
        print(f"Error: {e}", flush=True)
        sys.exit(1)
    
    count = len(results)
    if count == 1:
        # 1ダイスの場合はシンプルに数値だけ出力
        print(total, flush=True)
    else:
        # 複数ダイスの場合は合計値と内訳を出力
        breakdown = '+'.join(map(str, results))
        print(f"{total} [{breakdown}]", flush=True)


if __name__ == "__main__":
    main()
