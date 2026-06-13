const passport = require("passport");
const { Strategy: JwtStrategy, ExtractJwt } = require("passport-jwt");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    },
    async (payload, done) => {
      try {
        const user = await prisma.user.findUnique({ where: { id: payload.sub } });
        return user ? done(null, user) : done(null, false);
      } catch (err) {
        return done(err, false);
      }
    }
  )
);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_REDIRECT_URI,
      scope: ["profile", "email", "https://www.googleapis.com/auth/gmail.modify"],
    },
    async (accessToken, refreshToken, params, profile, done) => {
      try {
        const email = profile.emails[0].value;
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.create({
            data: { email, name: profile.displayName },
          });
        }
        await prisma.googleToken.upsert({
          where: { userId: user.id },
          update: {
            accessToken,
            refreshToken: refreshToken || "",
            expiresAt: new Date(Date.now() + params.expires_in * 1000),
            scope: params.scope || "",
          },
          create: {
            userId: user.id,
            accessToken,
            refreshToken: refreshToken || "",
            expiresAt: new Date(Date.now() + (params.expires_in || 3600) * 1000),
            scope: params.scope || "",
          },
        });
        return done(null, user);
      } catch (err) {
        return done(err, false);
      }
    }
  )
);

module.exports = passport;
