# 考研信息类专业可视化平台

本项目是课程期末设计的数据可视化配套平台，基于 2020-2026 年信息类专业考研规整数据，提供数据查询、统计概览、年度趋势、分数分布、院校竞争气泡图、院校 Top 排名等看板功能。

## 目录结构

- `data/`：清洗后的 CSV 数据和 SQLite 数据库
- `backend/`：Python 后端接口
- `frontend/`：前端页面、样式与 ECharts 可视化代码

## 启动方式

```powershell
cd "E:\交作业的文件\人工智能数据处理\期末设计\项目的所在地\可视化平台"
python app.py
```

或者直接运行：

```powershell
.\start_platform.bat
```

## 主要接口

- `/api/health`
- `/api/summary`
- `/api/options`
- `/api/dashboard`
- `/api/search`
