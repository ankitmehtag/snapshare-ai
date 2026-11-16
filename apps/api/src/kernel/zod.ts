// Single import point for Zod in the API: guarantees `.openapi()` is available
// regardless of module load order.
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export { z };
