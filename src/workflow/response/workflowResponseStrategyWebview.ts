import { Protocol } from 'rsp-wtp-client';
import { WebSphereJvmPropertiesEditorAdapter } from '../../websphereJvmPropertiesEditorAdapter';
import { ServerExplorer } from '../../serverExplorer';

export class WorkflowResponseStrategyWebview {
    public static async doAction(item: Protocol.WorkflowResponseItem, workflowMap?: { [index: string]: any }): Promise<boolean> {
        if (!item || !item.properties) {
            return false;
        }
        const viewType = item.properties.viewType;
        if (viewType !== 'websphere.jvmProperties') {
            return false;
        }
        if (!workflowMap) {
            workflowMap = {};
        }
        await WebSphereJvmPropertiesEditorAdapter.getInstance(ServerExplorer.getInstance()).openEditor(workflowMap, item);
        return true;
    }
}
