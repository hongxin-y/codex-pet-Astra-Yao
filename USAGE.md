# Codex 宠物配置与使用指南

这份文档说明如何把 Astra Yao 配置为 Codex Desktop 自定义宠物。

## 1. 文件结构

Codex 自定义宠物通常放在：

```text
C:\Users\<你的用户名>\.codex\pets\<pet-id>\
```

本宠物建议使用：

```text
C:\Users\yangh6\.codex\pets\astra-yao\
```

目录中至少需要两个文件：

```text
astra-yao/
|-- pet.json
`-- spritesheet.webp
```

## 2. 安装 Astra Yao

在 PowerShell 中运行：

```powershell
Copy-Item -Path "C:\repos\codex-pet-Astra-Yao" -Destination "$env:USERPROFILE\.codex\pets\astra-yao" -Recurse -Force
```

安装后目录应为：

```text
C:\Users\yangh6\.codex\pets\astra-yao\
|-- pet.json
`-- spritesheet.webp
```

如果 Codex Desktop 已经打开，重启应用，让它重新读取宠物目录。

## 3. pet.json 配置

当前配置如下：

```json
{
  "id": "astra-yao",
  "displayName": "Astra Yao",
  "description": "A tiny Codex desktop pet inspired by Astra Yao: dark teal long-haired stage singer with red-black jacket, white dress, and tall gold ring microphone staff.",
  "spritesheetPath": "spritesheet.webp"
}
```

字段说明：

- `id`: 宠物唯一 ID。建议使用小写英文、数字和连字符，例如 `astra-yao`。
- `displayName`: Codex 界面中展示的名称，例如 `Astra Yao`。
- `description`: 宠物外观或来源的一句话描述。
- `spritesheetPath`: 动画图文件路径。当前指向同目录下的 `spritesheet.webp`。

## 4. 关于 spritesheet 版本

当前 `spritesheet.webp` 尺寸是 `1536x1872`，对应 8 列 x 9 行的标准动画表。

因此当前 `pet.json` 不需要，也不应该添加：

```json
"spriteVersionNumber": 2
```

只有当素材升级为 `1536x2288`、8 列 x 11 行的 v2 动画表时，才应添加 `"spriteVersionNumber": 2`。

## 5. 验证安装

运行：

```powershell
Get-ChildItem "$env:USERPROFILE\.codex\pets\astra-yao"
```

你应该能看到：

```text
pet.json
spritesheet.webp
```

如果 Codex 没有显示新宠物，依次检查：

- `pet.json` 是否是合法 JSON。
- `spritesheetPath` 是否指向真实存在的文件。
- 安装目录是否为 `%USERPROFILE%\.codex\pets\astra-yao`。
- `pet.json` 里的 `id` 是否为 `astra-yao`。

## 6. 分发给别人

把整个 `codex-pet-Astra-Yao` 文件夹打包即可。

对方解压后，将文件夹复制到自己的：

```text
%USERPROFILE%\.codex\pets\astra-yao
```

然后重启 Codex Desktop。

