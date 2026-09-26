from fastapi import FastAPI

app = FastAPI(title="SkillSwap API")


@app.get("/api/health")
def health():
    return {"status": "ok"}