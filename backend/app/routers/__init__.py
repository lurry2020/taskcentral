from fastapi import APIRouter

from app.routers import (
    auth,
    chat,
    changelog,
    dashboard,
    data,
    dependencies,
    documents,
    health,
    machines,
    notes,
    network,
    obsidian_templates,
    reminder_templates,
    reminders,
    services,
    setup,
    settings_router,
    storage,
    task_templates,
    tasks,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(setup.router)
api_router.include_router(chat.router)
api_router.include_router(changelog.router)
api_router.include_router(dashboard.router)
api_router.include_router(machines.router)
api_router.include_router(tasks.router)
api_router.include_router(reminders.router)
api_router.include_router(reminder_templates.router)
api_router.include_router(services.router)
api_router.include_router(storage.router)
api_router.include_router(network.router)
api_router.include_router(dependencies.router)
api_router.include_router(notes.router)
api_router.include_router(task_templates.router)
api_router.include_router(obsidian_templates.router)
api_router.include_router(documents.router)
api_router.include_router(settings_router.router)
api_router.include_router(data.router)
