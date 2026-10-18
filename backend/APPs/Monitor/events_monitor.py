"""Register monitoring socket events; authorization and dispatch live in module_monitor."""

# ◆—< Pack >—————————————————————————————————◆ Project
from APPs.Monitor.module import MonitorEventModule, authorize_monitor

# ◆—< Pack >—————————————————————————————————◆ System
from SYSTEM.events import EventMonitor, NameSpace
from SYSTEM.extension import sio

# Event discovery binds the permission callback before lifespan starts the stream.
sio.monitor_authorize = authorize_monitor


@sio.event(namespace=NameSpace.MONITOR)
async def connect(sid, environ, auth=None):
    # Identity always comes from the server session; the client auth object is ignored.
    return await MonitorEventModule(sio).connect(sid, environ)


@sio.event(namespace=NameSpace.MONITOR)
async def disconnect(sid, reason=None):
    return await MonitorEventModule(sio).disconnect(sid, reason)


@sio.on(EventMonitor.SUBSCRIBE, namespace=NameSpace.MONITOR)
async def monitor_subscribe(sid, data=None):
    return await MonitorEventModule(sio).subscribe(sid, data)


@sio.on(EventMonitor.RESYNC, namespace=NameSpace.MONITOR)
async def monitor_resync(sid, data=None):
    return await MonitorEventModule(sio).subscribe(sid, data, resync=True)


@sio.on(EventMonitor.UNSUBSCRIBE, namespace=NameSpace.MONITOR)
async def monitor_unsubscribe(sid):
    return await MonitorEventModule(sio).unsubscribe(sid)


@sio.on(EventMonitor.TEST, namespace=NameSpace.MONITOR)
async def monitor_test(sid, data=None):
    return await MonitorEventModule(sio).test(sid, data)
