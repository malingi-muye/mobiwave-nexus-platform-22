import React, { useState } from "react";
import { Database, Upload, Activity, Plus, BarChart3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataHubModelsList } from "@/components/data-hub/DataHubModelsList";
import { DataHubRecordsList } from "@/components/data-hub/DataHubRecordsList";
import { ImportJobsMonitor } from "@/components/data-hub/ImportJobsMonitor";
import { CreateModelDialog } from "@/components/data-hub/CreateModelDialog";
import { FileUpload } from "@/components/data-hub/FileUpload";

const DataHubPage = () => {
  const [activeTab, setActiveTab] = useState("models");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center">
            <Database className="w-8 h-8 mr-3 text-blue-600" />
            Data Hub
          </h1>
          <p className="text-gray-600 mt-1">
            Manage your data models, records, and import operations
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Model
        </Button>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="models" className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            Data Models
          </TabsTrigger>
          <TabsTrigger value="records" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Records
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Import Data
          </TabsTrigger>
          <TabsTrigger value="jobs" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Import Jobs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="space-y-6">
          <DataHubModelsList 
            onModelSelect={setSelectedModelId}
            selectedModelId={selectedModelId}
          />
        </TabsContent>

        <TabsContent value="records" className="space-y-6">
          <DataHubRecordsList selectedModelId={selectedModelId} />
        </TabsContent>

        <TabsContent value="import" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Import Data</CardTitle>
            </CardHeader>
            <CardContent>
              <FileUpload onUploadComplete={(jobId) => {
                setActiveTab("jobs");
              }} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs" className="space-y-6">
          <ImportJobsMonitor />
        </TabsContent>
      </Tabs>

      <CreateModelDialog 
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
    </div>
  );
};

export default DataHubPage;