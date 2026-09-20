const noop: any = async () => {};
export default new Proxy({}, { get: () => noop });
export const initOneSignal = noop;
export const initializeOneSignal = noop;
export const setExternalUserId = noop;
export const setUserPhone = noop;
export const setUserEmail = noop;
export const sendTag = noop;
