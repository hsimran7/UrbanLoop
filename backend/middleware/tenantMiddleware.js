// Automatically restrict queries and bodies to the user's municipality
const restrictToTenant = (req, res, next) => {
  if (req.user && req.user.role !== 'super_admin') {
    // Force municipalityId in body for creates/updates
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      req.body.municipalityId = req.user.municipalityId;
    }
    // Note: Mongoose queries will need to explicitly use req.user.municipalityId 
    // This middleware is mostly for ensuring we don't accidentally accept a different ID
  }
  next();
};

module.exports = { restrictToTenant };
