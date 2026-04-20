import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routers import ai, annotation, exchange, filesystem, project, taxonomy, vis

app = FastAPI(title="MultiAnno Backend")


# 🌟 把这个无敌显微镜加在这里（紧跟在 app = FastAPI() 之后）
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    body = await request.body()
    print("\n" + "=" * 40)
    print("🚨 [Backend] DATA VALIDATION ERROR!")
    print(f"Received Body: {body.decode('utf-8') if body else 'Empty'}")
    print(f"Missing/Wrong Fields: {exc.errors()}")
    print("=" * 40 + "\n")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": body.decode("utf-8") if body else ""},
    )


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
app.include_router(ai.router)
app.include_router(vis.router)
app.include_router(exchange.router)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
