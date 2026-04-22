# MultiAnno
[English](README.md) | [简体中文](README_zh-CN.md)

[![React](https://img.shields.io/badge/Frontend-React_18-61dafb?logo=react)]([https://reactjs.org/](https://reactjs.org/))
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)](https://fastapi.tiangolo.com/)

**MultiAnno: An AI-assisted image annotation tool for multi-view tasks.**

> **A Special Note:** The core architecture and codebase of this project were developed with the pair-programming assistance of **Google Gemini 3.1 Pro**. 

---

## Key Features

### Multi-View Sync
MultiAnno supports the simultaneous, synchronized viewing of multi-band and multi-modal imagery (e.g., RGB, Infrared, Depth). It features viewport and crosshair synchronization to facilitate comparative annotation across different views.

### AI-Assisted Annotation
Integrated with the Segment Anything Model (SAM 3). It supports generating polygons and masks via point and box prompts, reducing the need for manual outlining and improving annotation efficiency.

### Modular User Interface
Built with React, MultiAnno provides a clean and modular user interface. It includes Dark/Light theme switching and a consolidated right panel for tools and properties, designed to keep the main workspace clear for annotation tasks.

---

## Functions

For advanced features and detailed configurations, please refer to the specific module documentation:

* **[Project & Data Management](docs/project_management.md)**
* **[Taxonomy Dashboard](docs/taxonomy.md)**
* **[Annotation Tool](docs/annotation_tool.md)**
* **[Data Format Exchange](docs/data_format.md)**
* **[Local Visualization Engine](docs/visualization.md)**

---

## Quick Start

### 1. Requirements
* Node.js (>= 18.x)
* Python (>= 3.10)

### 2. Installation
**Start the Frontend**
```bash
cd frontend
npm install
npm run dev
```

**Start the Backend**
```bash
cd backend
pip install -r requirements.txt
python main.py
```

### 3. Start Your Annotation
Basic workflow:

1. **Create a new project:**
   * Set up your project meta path.
   * Select your image folder(s) and corresponding views.
   * Define the view extent relationships.
2. **Manage your taxonomy:** Define your annotation classes and attributes.
3. **Annotate:** Draw your annotations on the synchronized image views.
4. **Export:** Export your annotations to standard formats.
5. **Visualize:** Visualize your annotations and multi-view results locally.

---

## Acknowledgments
I extend my heartfelt thanks to the developers and contributors of Ultralytics, SAM 3 (Segment Anything 3), and X-AnyLabeling. 

## License
MultiAnno operates under the terms of the [AGPL-3.0 License](./LICENSE). As a completely free and open-source initiative, this platform is dedicated to all developers and researchers. We hope it can serve as a practical infrastructure to support and advance your daily annotation workflows.

## Citing
If you use this software in your research, please cite it as below:
```bibtex
@misc{multianno,
  title={{MultiAnno: An AI-assisted image annotation tool for multi-view tasks}},
  author={Huilin ZHAO},
  year={2026},
  publisher={GitHub},
  howpublished={\url{[https://github.com/huilin66/multianno](https://github.com/huilin66/multianno)}}
}
```