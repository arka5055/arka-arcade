import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  loadProgress,
  saveProgress,
  newPlayerId,
  playerFromCookie,
  playerCookie,
} from "../scripts/arcade-db.mjs";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  arcade: router({
    getProgress: publicProcedure.query(({ ctx }) => {
      let player = playerFromCookie(ctx.req.headers.cookie);
      if (!player) player = newPlayerId();
      ctx.res.setHeader("Set-Cookie", playerCookie(player));
      return { player, payload: loadProgress(player) };
    }),
    saveProgress: publicProcedure
      .input(z.any())
      .mutation(({ ctx, input }) => {
        let player = playerFromCookie(ctx.req.headers.cookie);
        if (!player) player = newPlayerId();
        ctx.res.setHeader("Set-Cookie", playerCookie(player));
        const payload = input.payload && typeof input.payload === "object" ? input.payload : input;
        return { player, payload: saveProgress(player, payload) };
      }),
  }),
});

export type AppRouter = typeof appRouter;
