/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import { Protocol, RSPWTPClient, StatusSeverity } from 'rsp-wtp-client';
import * as vscode from 'vscode';

export class JobProgress {

    private static readonly JOB_TIMEOUT: number = 1000 * 60 * 10; // 10 minutes
    private static readonly STATUS_BAR_PRIORITY = 100;

    private readonly job: Protocol.JobHandle;
    private readonly client: RSPWTPClient;
    private readonly progress: vscode.Progress<{ message?: string, increment?: number }>;
    private readonly cancellation: vscode.CancellationToken;
    private readonly reject: (reason?: any) => void;
    private readonly resolve: (value?: Protocol.JobHandle | PromiseLike<Protocol.JobHandle>) => void;
    private readonly statusBarItem: vscode.StatusBarItem;
    private timeoutId: NodeJS.Timeout;
    private percents = 0;

    public static create(client: RSPWTPClient) {
        client.getIncomingHandler().onJobAdded((jobHandle: Protocol.JobHandle) => {
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: jobHandle.name,
                    cancellable: true
                },
                (progress, token) => {
                    return new Promise<Protocol.JobHandle>((resolve, reject) => {
                        new JobProgress(jobHandle, client, progress, token, reject, resolve);
                    }).catch(error => {
                        if (error) {
                            vscode.window.showErrorMessage(error);
                        }
                        return Promise.reject(error);
                    });
                });
        });
    }

    private constructor(job: Protocol.JobHandle,
        client: RSPWTPClient,
        progress: vscode.Progress<{ message?: string, increment?: number }>,
        cancellation: vscode.CancellationToken,
        reject: (reason?: any) => void,
        resolve: (value?: Protocol.JobHandle | PromiseLike<Protocol.JobHandle>) => void) {
        this.job = job;
        this.client = client;
        this.progress = progress;
        this.cancellation = cancellation;
        this.reject = reject;
        this.resolve = resolve;
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            JobProgress.STATUS_BAR_PRIORITY
        );
        this.initListeners();
        this.setTimeout();
        this.updateStatusBar();

        progress.report({ increment: 0 });
    }

    private initListeners() {
        this.cancellation.onCancellationRequested(() => { this.onCancel(); });
        this.client.getIncomingHandler().onJobRemoved((jobRemoved: Protocol.JobRemoved) => {
            this.onJobRemoved(jobRemoved);
        });
        this.client.getIncomingHandler().onJobChanged((jobProgress: Protocol.JobProgress) => {
            this.onJobProgress(jobProgress); });
    }

    private onJobProgress(jobProgress: Protocol.JobProgress) {
        if (!this.isJob(jobProgress.handle)) {
            return;
        }
        this.progress.report({
            message: this.getProgressMessage(jobProgress),
            increment: jobProgress.percent - this.percents
        });
        this.percents = jobProgress.percent;
        this.updateStatusBar(jobProgress.message);
        this.restartTimeout();
    }

    private getProgressMessage(jobProgress: Protocol.JobProgress): string | undefined {
        return this.normalizeMessage(jobProgress.message);
    }

    private onJobRemoved(jobRemoved: Protocol.JobRemoved) {
        if (!this.isJob(jobRemoved.handle)) {
            return;
        }
        this.clearTimeout();
        this.disposeStatusBar();
        if (!StatusSeverity.isOk(jobRemoved.status)) {
            this.reject(this.getErrorMessage(jobRemoved.status));
        } else {
            this.resolve(this.job);
        }
    }

    private getErrorMessage(status: Protocol.Status) {
        let message = '';
        if (status) {
            message = status.message;
            if (status.trace) {
                const match = /Caused by:([^\n]+)/gm.exec(status.trace);
                if (match && match.length && match.length > 1) {
                    message += `:${  match[1]}`;
                }
            }
        }
        return message;
    }

    private async onCancel() {
        await this.client.getOutgoingHandler().cancelJob(this.job);
        if (this.timeoutId) {
            this.clearTimeout();
        }
        this.disposeStatusBar();
        this.reject();
    }

    private isJob(job: Protocol.JobHandle): boolean {
        return job && this.job.id === job.id;
    }

    private restartTimeout() {
        this.clearTimeout();
        this.setTimeout();
    }

    private setTimeout() {
        this.timeoutId = setTimeout(() => {
            console.log(`Job ${this.job.name} timed out at ${this.percents}`);
            this.disposeStatusBar();
            this.reject(`${this.job.name} timed out.`);
        }, JobProgress.JOB_TIMEOUT);
    }

    private clearTimeout() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }
    }

    private updateStatusBar(detailMessage?: string) {
        const percentLabel = `${Math.round(this.percents)}%`;
        this.statusBarItem.text = `$(sync~spin) ${this.job.name} (${percentLabel})`;
        const detail = this.normalizeMessage(detailMessage);
        this.statusBarItem.tooltip = detail ? `${this.job.name}\n${detail}` : this.job.name;
        this.statusBarItem.show();
    }

    private disposeStatusBar() {
        this.statusBarItem.hide();
        this.statusBarItem.dispose();
    }

    private normalizeMessage(message?: string): string | undefined {
        const detail = message?.trim();
        return detail ? detail : undefined;
    }
}
