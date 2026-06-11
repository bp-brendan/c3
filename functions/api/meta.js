import { handleMetaRequest } from '../../workers/meta-fetcher/src/meta.js';

export const onRequest = ({ request }) => handleMetaRequest(request);
