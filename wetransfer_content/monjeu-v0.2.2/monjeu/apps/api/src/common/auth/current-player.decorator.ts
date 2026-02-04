import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentPlayer = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
