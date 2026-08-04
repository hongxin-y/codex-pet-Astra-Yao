# Codex 宠物配置与使用指南

这份指南教你如何把本目录里的宠物素材配置到 Codex Desktop 里。

## 1. 目录结构要求

Codex 自定义宠物通常放在：

```text
C:\Users\<你的用户名>\.codex\pets\<pet-id>\
```

在本机上也就是：

```text
C:\Users\yangh6\.codex\pets\<pet-id>\
```

每个宠物目录至少需要：

```text
<pet-id>/
├── pet.json
└── spritesheet.webp
```

## 2. 原样安装当前宠物

当前从 `jiayin` 复制而来，`pet.json` 里的 `id` 仍然是 `jiayin`。如果你想保持原 ID，运行：

```powershell
Copy-Item -Path "C:\repos\codex-pet-Astra-Yao" -Destination "$env:USERPROFILE\.codex\pets\jiayin" -Recurse -Force
```

安装后目录应为：

```text
C:\Users\yangh6\.codex\pets\jiayin\
├── pet.json
└── spritesheet.webp
```

如果 Codex 已经打开，重启 Codex Desktop，或关闭后重新打开，让它重新读取宠物目录。

## 3. 配置成 Astra Yao

如果你希望它作为一个新宠物出现，而不是覆盖 `jiayin`，推荐把 `pet.json` 改成：

```json
{
  "id": "astra-yao",
  "displayName": "Astra Yao",
  "description": "A tiny Codex desktop pet inspired by Yao Jiayin: dark teal long-haired stage singer with red-black jacket, white dress, and tall gold ring microphone staff.",
  "spritesheetPath": "spritesheet.webp"
}
```

然后复制到：

```powershell
Copy-Item -Path "C:\repos\codex-pet-Astra-Yao" -Destination "$env:USERPROFILE\.codex\pets\astra-yao" -Recurse -Force
```

最终目录应为：

```text
C:\Users\yangh6\.codex\pets\astra-yao\
├── pet.json
└── spritesheet.webp
```

## 4. pet.json 字段说明

- `id`: 宠物的唯一 ID，建议使用小写英文、数字和连字符，例如 `astra-yao`。
- `displayName`: 在界面中展示的名称，例如 `Astra Yao`。
- `description`: 一句话描述宠物外观或来源。
- `spritesheetPath`: 动画图文件路径。当前是同目录下的 `spritesheet.webp`。

当前这份 `spritesheet.webp` 是 `1536x1872`，对应 8 列 x 9 行的标准动画表。因此 `pet.json` 里不要添加：

```json
"spriteVersionNumber": 2
```

只有当素材升级成 `1536x2288`、8 列 x 11 行的 v2 动画表时，才应添加 `"spriteVersionNumber": 2`。

## 5. 验证安装

运行下面命令确认文件存在：

```powershell
Get-ChildItem "$env:USERPROFILE\.codex\pets\astra-yao"
```

或如果你使用原 ID：

```powershell
Get-ChildItem "$env:USERPROFILE\.codex\pets\jiayin"
```

你应该能看到：

```text
pet.json
spritesheet.webp
```

如果 Codex 没显示新宠物，优先检查三件事：

- `pet.json` 是否是合法 JSON。
- `spritesheetPath` 是否正好指向存在的文件名。
- 宠物目录名是否和 `pet.json` 里的 `id` 保持一致。

## 6. 分发给别人

把整个 `codex-pet-Astra-Yao` 文件夹打包即可。对方解压后，把目录复制到自己的：

```text
%USERPROFILE%\.codex\pets\
```

如果对方使用不同的宠物 ID，记得同时修改目录名和 `pet.json` 里的 `id`。

