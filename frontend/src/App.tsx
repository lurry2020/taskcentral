import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { Machines } from "@/pages/Machines";
import { MachineDetail } from "@/pages/machine/MachineDetail";
import { NewMachine } from "@/pages/new-machine/NewMachine";
import { TaskTemplates } from "@/pages/TaskTemplates";
import { ReminderTemplates } from "@/pages/ReminderTemplates";
import { ObsidianTemplates } from "@/pages/ObsidianTemplates";
import { SettingsPage } from "@/pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="/inventory" element={<Machines />} />
        <Route path="/inventory/new" element={<NewMachine />} />
        <Route path="/inventory/:id" element={<MachineDetail />} />
        <Route path="/inventory/:id/:tab" element={<MachineDetail />} />
        {/* Legacy /machines paths redirect to /inventory */}
        <Route path="/machines" element={<Navigate to="/inventory" replace />} />
        <Route path="/machines/*" element={<Navigate to="/inventory" replace />} />
        <Route path="/task-templates" element={<TaskTemplates />} />
        <Route path="/reminder-templates" element={<ReminderTemplates />} />
        <Route path="/obsidian-templates" element={<ObsidianTemplates />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
