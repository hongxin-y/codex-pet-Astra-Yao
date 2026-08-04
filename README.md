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

- `pet.json`: Codex pet manifest. It defines the pet ID, display name, description, and spritesheet path.
- `spritesheet.webp`: Animated spritesheet used by Codex Desktop.
- `README.md`: Package overview.
- `USAGE.md`: Installation and configuration guide.

## Manifest

```json
{
  "id": "astra-yao",
  "displayName": "Astra Yao",
  "description": "A tiny Codex desktop pet inspired by Astra Yao: dark teal long-haired stage singer with red-black jacket, white dress, and tall gold ring microphone staff.",
  "spritesheetPath": "spritesheet.webp"
}
```

## Install

Copy this folder into your local Codex pets directory:

```powershell
Copy-Item -Path "C:\repos\codex-pet-Astra-Yao" -Destination "$env:USERPROFILE\.codex\pets\astra-yao" -Recurse -Force
```

Then restart Codex Desktop if the pet does not appear immediately.

## Asset Notes

The current spritesheet is `1536x1872`, matching the 8-column x 9-row standard Codex pet layout.

Do not add `"spriteVersionNumber": 2` to `pet.json` unless the spritesheet is upgraded to a `1536x2288` v2 atlas.

