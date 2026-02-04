/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import { Incoming, Outgoing, OutgoingSynchronous, OutgoingWTP, RSPWTPClient, ServerCreation } from 'rsp-wtp-client';

export class ClientStubs {

    public clientStub: sinon.SinonStubbedInstance<RSPWTPClient>;
    public get client(): RSPWTPClient { return this.clientStub as unknown as RSPWTPClient; }
    public incoming: sinon.SinonStubbedInstance<Incoming>;
    public outgoing: sinon.SinonStubbedInstance<Outgoing>;
    public outgoingWTP: sinon.SinonStubbedInstance<OutgoingWTP>;
    public outgoingSync: sinon.SinonStubbedInstance<OutgoingSynchronous>;
    public serverCreation: sinon.SinonStubbedInstance<ServerCreation>;

    constructor(sandbox: sinon.SinonSandbox) {
        this.clientStub = sandbox.stub(RSPWTPClient.prototype);
        this.clientStub.connect.resolves();

        this.outgoing = sandbox.createStubInstance(Outgoing);
        this.clientStub.getOutgoingHandler.returns(this.outgoing as unknown as Outgoing);

        this.outgoingSync = sandbox.createStubInstance(OutgoingSynchronous);
        this.clientStub.getOutgoingSyncHandler.returns(this.outgoingSync as unknown as OutgoingSynchronous);

        this.incoming = sandbox.createStubInstance(Incoming);
        this.clientStub.getIncomingHandler.returns(this.incoming as unknown as Incoming);

        this.serverCreation = sandbox.createStubInstance(ServerCreation);
        this.clientStub.getServerCreation.returns(this.serverCreation as unknown as ServerCreation);
    }
}
