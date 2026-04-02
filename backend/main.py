import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 引入拆分后的路由
from routers import annotation, filesystem, project, taxonomy

app = FastAPI(title="MultiAnno Backend")

# 跨域配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册所有路由模块
app.include_router(filesystem.router)
app.include_router(project.router)
app.include_router(annotation.router)
app.include_router(taxonomy.router)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
