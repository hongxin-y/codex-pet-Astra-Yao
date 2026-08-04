# Codex Pet: Astra Yao

This folder is a portable Codex desktop pet package copied from:

```text
C:\Users\yangh6\.codex\pets\jiayin
```

It currently contains the original `jiayin` pet assets and manifest. The pet is a Yao Jiayin-inspired desktop companion: dark teal long hair, red-black jacket, white dress, and a gold ring microphone staff.

## Files

```text
codex-pet-Astra-Yao/
├── pet.json
├── spritesheet.webp
├── README.md
└── USAGE.md
```

- `pet.json`: Codex pet manifest. It defines the pet id, display name, description, and spritesheet file.
- `spritesheet.webp`: Animated pet spritesheet.
- `README.md`: Package overview.
- `USAGE.md`: Step-by-step installation and configuration guide.

## Current Manifest

The copied manifest is:

```json
{
  "id": "jiayin",
  "displayName": "Jiayin",
  "description": "A tiny Codex desktop pet inspired by the provided Yao Jiayin reference: dark teal long-haired stage singer with red-black jacket, white dress, and tall gold ring microphone staff.",
  "spritesheetPath": "spritesheet.webp"
}
```

Important: the current spritesheet is `1536x1872`, which matches the older 8-column x 9-row Codex pet layout. Do not add `"spriteVersionNumber": 2` unless the spritesheet is upgraded to a `1536x2288` v2 atlas.

## Quick Install

To install it as-is:

```powershell
Copy-Item -Path "C:\repos\codex-pet-Astra-Yao" -Destination "$env:USERPROFILE\.codex\pets\jiayin" -Recurse -Force
```

Then restart Codex Desktop if it does not pick up the pet immediately.

## Renaming To Astra Yao

If you want this package to appear as `Astra Yao`, edit `pet.json`:

```json
{
  "id": "astra-yao",
  "displayName": "Astra Yao",
  "description": "A tiny Codex desktop pet inspired by Yao Jiayin: dark teal long-haired stage singer with red-black jacket, white dress, and tall gold ring microphone staff.",
  "spritesheetPath": "spritesheet.webp"
}
```

Then install it under a matching folder:

```powershell
Copy-Item -Path "C:\repos\codex-pet-Astra-Yao" -Destination "$env:USERPROFILE\.codex\pets\astra-yao" -Recurse -Force
```

Keeping the folder name and `id` aligned makes the package easier to recognize and move between machines.

