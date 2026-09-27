from fastapi import FastAPI

app = FastAPI(title="SwapJob API")


@app.get("/api/health")
def health():
    return {"status": "ok"}