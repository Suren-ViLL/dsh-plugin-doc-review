# 发布步骤

三样东西挡住了自动发布，都需要你的账号：

| 需要 | 为什么我做不到 |
| --- | --- |
| **GitHub 账号**（用户名 + 仓库） | 没有 `gh` CLI，也没有存过 git 凭据；仓库必须建在你的账号下 |
| **npm 账号**（`npm login`） | 未登录（`npm error code ENEEDAUTH`），发布时需要密码 / 2FA |
| **一条 PR 到 awesome-dsh-plugin** | 要 fork + push + 开 PR，同样需要你的 GitHub 身份 |

---

## 一、推送 GitHub

先在 GitHub 网页上新建空仓库 `dsh-plugin-doc-review`（**不要**勾选 Initialize with README / .gitignore / license，本地已经有了）。

然后把 `<OWNER>` 换成你的 GitHub 用户名：

```bash
cd "C:\Users\szp01\Desktop\WORK STATION\DSH\dsh-doc-review"
git remote add origin https://github.com/<OWNER>/dsh-plugin-doc-review.git
git branch -M main
git push -u origin main
```

首次推送会弹窗要凭据。用 **Personal Access Token**（GitHub 头像 → Settings → Developer settings → Personal access tokens → Tokens (classic) → 勾 `repo`），密码那一栏填 token。

---

## 二、发布 npm

```bash
cd "C:\Users\szp01\Desktop\WORK STATION\DSH\dsh-doc-review"
npm login
npm publish
```

发布前可以再确认一次包内容（12 个文件 / 61 KB）：

```bash
npm pack --dry-run
```

装完别人就能：

```bash
dsh plugin add dsh-plugin-doc-review
```

---

## 三、上架插件市场

市场不是自己提交的 —— 它读的是 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 这份精选列表。**提一个只加一个文件的 PR** 就行：

```bash
git clone https://github.com/<你的用户名>/awesome-dsh-plugin.git
cd awesome-dsh-plugin
git checkout -b add-doc-review
mkdir -p data/plugins
```

新建 `data/plugins/<OWNER>__dsh-plugin-doc-review.yml`，内容用本目录的 `market-entry.yml`，把其中的 `<OWNER>` 换成你的用户名：

```yaml
url: https://github.com/<OWNER>/dsh-plugin-doc-review
name: <OWNER>/dsh-plugin-doc-review
category: docs
description:
  en: 'Review AI-generated Word, PowerPoint, PDF and HTML in the official preview: box problems, edit the text in place, and hand the notes to the agent.'
  zh: 在官方预览里审阅 Word、PowerPoint、PDF 与 HTML：框选问题、就地改字，再把批注交给 AI。
```

```bash
git add data/plugins/<OWNER>__dsh-plugin-doc-review.yml
git commit -m "Add dsh-plugin-doc-review"
git push origin add-doc-review
```

然后在 GitHub 上开 PR。合并后站点和插件市场会自动收录，**通常一天内生效**。

### 审核会看的几条（都已满足）

- `package.json` 声明 `dsh.bundle.patch` ✓
- 有 README ✓
- `category` 取自允许的取值（`docs`）✓
- 描述里的英文用单引号包住（含冒号）✓

---

## 你也可以让我全自动做完

如果你把下面任一项给我，我就能直接跑完三步：

1. **GitHub token**（`repo` + `workflow` 权限）—— 我建仓库、推代码、fork 并开 PR
2. **npm token** —— 我发布 npm 包

token 相当于账号权限，给之前请确认你接受。或者你只给我 GitHub 用户名，我先把 `market-entry.yml` 和 remote 都填好，你只需要执行 `git push` 和 `npm publish` 两条命令。
