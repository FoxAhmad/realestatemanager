// Wraps a service call: JSON on success, the service's { status, message, code } on a known error.
const handle = (fn, status = 200) => async (req, res) => {
  try {
    res.status(status).json(await fn(req));
  } catch (error) {
    if (error.status) {
      const { limit, allowed, used, feature } = error;
      return res.status(error.status).json({ message: error.message, code: error.code, limit, allowed, used, feature });
    }
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = handle;
