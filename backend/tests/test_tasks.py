def _tasks(client, machine_id):
    return client.get(f"/api/v1/machines/{machine_id}/tasks").json()


def test_delete_template_task_unit_is_machine_scoped():
    from sqlalchemy.orm import sessionmaker

    from app.database import build_engine
    from app.models import Base, Machine, MachineTask, TaskTemplate
    from app.routers.tasks import delete_task

    engine = build_engine("sqlite://")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = Session()
    try:
        template = TaskTemplate(
            title="Shared default",
            category="Validation",
            machine_type_scope="ALL",
            required=True,
            enabled=True,
            sort_order=10,
        )
        first = Machine(name="first-vm", machine_type="VM", status="In Progress")
        second = Machine(name="second-vm", machine_type="VM", status="In Progress")
        db.add_all([template, first, second])
        db.flush()
        first_task = MachineTask(
            machine_id=first.id,
            template_id=template.id,
            title=template.title,
            category=template.category,
            status="Pending",
            required=True,
            is_custom=False,
            sort_order=10,
        )
        second_task = MachineTask(
            machine_id=second.id,
            template_id=template.id,
            title=template.title,
            category=template.category,
            status="Pending",
            required=True,
            is_custom=False,
            sort_order=10,
        )
        db.add_all([first_task, second_task])
        db.commit()
        first_task_id = first_task.id
        second_task_id = second_task.id
        template_id = template.id

        response = delete_task(first.id, first_task_id, db)

        assert response.status_code == 204
        assert db.get(MachineTask, first_task_id) is None
        assert db.get(MachineTask, second_task_id) is not None
        assert db.get(TaskTemplate, template_id) is not None
    finally:
        db.close()
        engine.dispose()


def test_complete_task_updates_progress(client, machine):
    task = _tasks(client, machine["id"])[0]
    resp = client.patch(
        f"/api/v1/machines/{machine['id']}/tasks/{task['id']}",
        json={"status": "Completed"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "Completed"
    assert body["completed_at"] is not None
    progress = client.get(f"/api/v1/machines/{machine['id']}/tasks/progress").json()
    assert progress["completed_tasks"] == 1


def test_blocked_requires_reason(client, machine):
    task = _tasks(client, machine["id"])[0]
    resp = client.patch(
        f"/api/v1/machines/{machine['id']}/tasks/{task['id']}",
        json={"status": "Blocked"},
    )
    assert resp.status_code == 422
    resp = client.patch(
        f"/api/v1/machines/{machine['id']}/tasks/{task['id']}",
        json={"status": "Blocked", "blocked_reason": "Waiting on switch port"},
    )
    assert resp.status_code == 200


def test_not_applicable_excluded_from_progress(client, machine):
    tasks = _tasks(client, machine["id"])
    total = len(tasks)
    resp = client.patch(
        f"/api/v1/machines/{machine['id']}/tasks/{tasks[0]['id']}",
        json={"status": "Not Applicable", "not_applicable_reason": "No reverse proxy"},
    )
    assert resp.status_code == 200
    progress = client.get(f"/api/v1/machines/{machine['id']}/tasks/progress").json()
    assert progress["applicable_tasks"] == total - 1


def test_custom_task_add_delete(client, machine):
    resp = client.post(
        f"/api/v1/machines/{machine['id']}/tasks",
        json={"title": "Install ZFS tools", "category": "Provisioning"},
    )
    assert resp.status_code == 201
    task = resp.json()
    assert task["is_custom"] is True
    assert client.delete(f"/api/v1/machines/{machine['id']}/tasks/{task['id']}").status_code == 204


def test_template_task_delete_is_scoped_to_one_machine(client, machine):
    template_task = _tasks(client, machine["id"])[0]
    template_id = template_task["template_id"]
    title = template_task["title"]

    other = client.post(
        "/api/v1/machines",
        json={"name": "second-vm", "machine_type": "VM"},
    ).json()
    other_task = next(t for t in _tasks(client, other["id"]) if t["template_id"] == template_id)

    response = client.delete(
        f"/api/v1/machines/{machine['id']}/tasks/{template_task['id']}"
    )
    assert response.status_code == 204

    # Only this machine's copied task is gone.
    assert template_task["id"] not in {t["id"] for t in _tasks(client, machine["id"])}
    assert any(t["id"] == other_task["id"] for t in _tasks(client, other["id"]))

    # The global template remains and can be offered to this machine again explicitly.
    templates = client.get("/api/v1/task-templates").json()
    assert any(t["id"] == template_id and t["title"] == title for t in templates)
    preview = client.get(
        f"/api/v1/machines/{machine['id']}/tasks/apply-templates/preview"
    ).json()
    assert any(t["id"] == template_id for t in preview["tasks"])


def test_reorder(client, machine):
    tasks = _tasks(client, machine["id"])
    ids = [t["id"] for t in tasks]
    ids.reverse()
    resp = client.post(f"/api/v1/machines/{machine['id']}/tasks/reorder", json={"task_ids": ids})
    assert resp.status_code == 200
    assert [t["id"] for t in resp.json()] == ids


def test_apply_templates_no_duplicates(client, machine):
    preview = client.get(
        f"/api/v1/machines/{machine['id']}/tasks/apply-templates/preview"
    ).json()
    assert preview["tasks"] == []
    # add a new template scoped to VM, preview should now show it
    resp = client.post(
        "/api/v1/task-templates",
        json={"title": "Enable qemu-guest-agent", "category": "Provisioning", "machine_type_scope": "VM"},
    )
    assert resp.status_code == 201
    preview = client.get(
        f"/api/v1/machines/{machine['id']}/tasks/apply-templates/preview"
    ).json()
    assert [t["title"] for t in preview["tasks"]] == ["Enable qemu-guest-agent"]
    applied = client.post(f"/api/v1/machines/{machine['id']}/tasks/apply-templates").json()
    assert len(applied["added"]) == 1
    # second apply is a no-op
    applied = client.post(f"/api/v1/machines/{machine['id']}/tasks/apply-templates").json()
    assert applied["added"] == []
