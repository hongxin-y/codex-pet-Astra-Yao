# Codex Pet: Astra Yao

Astra Yao is a custom Codex Desktop pet package. It includes the pet manifest, animated spritesheet, and setup notes needed to install the pet locally or share it with another Codex user.

The character is a compact stage-singer style desktop companion with dark teal long hair, a red-black jacket, a white dress, and a tall gold ring microphone staff.

## Files

```text
codex-pet-Astra-Yao/
|-- pet.json
|-- spritesheet.webp
|-- README.md
`-- USAGE.md
```

- `pet.json`: Codex pet manifest. It defines the pet ID, display name, description, sprite version, and spritesheet path.
- `spritesheet.webp`: Codex v2 animated spritesheet, including the standard animations and 16 look directions.
- `README.md`: Package overview.
- `USAGE.md`: Installation and configuration guide.

## Manifest

```json
{
  "id": "astra-yao",
  "displayName": "Astra Yao",
  "description": "A tiny Codex desktop pet inspired by Astra Yao: dark teal long-haired stage singer with red-black jacket, white dress, and tall gold ring microphone staff.",
  "spriteVersionNumber": 2,
  "spritesheetPath": "spritesheet.webp"
}
```

## Install

Copy this folder into your local Codex pets directory:

```powershell
$source = "C:\repos\codex-pet-Astra-Yao-main\codex-pet-Astra-Yao-main"
Copy-Item -Path $source -Destination "$env:USERPROFILE\.codex\pets\astra-yao" -Recurse -Force
```

Then restart Codex Desktop if the pet does not appear immediately.

## Asset Notes

The spritesheet is `1536x2288`, matching the Codex v2 8-column x 11-row layout. Rows 0–8 contain the standard animations; rows 9–10 contain 16 clockwise look directions. The manifest therefore declares `"spriteVersionNumber": 2`.
