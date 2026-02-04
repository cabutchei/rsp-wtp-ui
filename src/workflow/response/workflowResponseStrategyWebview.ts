import { Protocol } from 'rsp-wtp-client';
import { myContext } from '../../extension';
import { WebSphereJvmPropertiesWebview } from '../../webviews/websphereJvmPropertiesWebview';

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
        const dataKey = item.properties.dataKey || item.id || 'websphere.jvm.properties';
        let entries: any[] = [];
        if (item.content) {
            try {
                entries = JSON.parse(item.content);
            } catch (err) {
                entries = [];
            }
        }
        const subtitle = item.properties.title || 'Edit WebSphere JVM system properties.';

        return new Promise<boolean>((resolve) => {
            if (!myContext) {
                resolve(true);
                return;
            }
            let done = false;
            const panel = WebSphereJvmPropertiesWebview.show(myContext, {
                entries: Array.isArray(entries) ? entries : [],
                subtitle: subtitle,
            }, (message) => {
                if (!message || done) {
                    return;
                }
                if (message.type === 'save') {
                    workflowMap[dataKey] = JSON.stringify(message.entries || []);
                    done = true;
                    resolve(false);
                    panel.dispose();
                    return;
                }
                if (message.type === 'cancel') {
                    done = true;
                    resolve(true);
                    panel.dispose();
                }
            });
            panel.onDidDispose(() => {
                if (!done) {
                    done = true;
                    resolve(true);
                }
            });
        });
    }
}
