// routes/logsRoutes.js
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';

const router = express.Router();

/**
 * GET /api/logs - Get paginated logs with filtering
 * Query params:
 * - limit: number of logs per page (default: 100)
 * - page: page number (default: 1)
 * - level: filter by log level (error, warn, info, debug)
 * - startDate: filter logs from this date
 * - endDate: filter logs until this date
 * - search: search in message and traceId
 */
router.get('/api/logs', async (req, res) => {
  let client;
  try {
    const {
      limit = 100,
      level,
      startDate,
      endDate,
      search,
      page = 1
    } = req.query;

    client = new MongoClient(process.env.MONGO_URI);
    await client.connect();

    // Build query filter
    const filter = {};
    
    if (level) {
      filter.level = level;
    }
    
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }
    
    if (search) {
      filter.$or = [
        { message: { $regex: search, $options: 'i' } },
        { 'meta.traceId': { $regex: search, $options: 'i' } },
        { 'meta.spanId': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get logs with pagination
    const logs = await client
      .db("test")
      .collection("applogs")
      .find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    // Get total count for pagination
    const totalCount = await client
      .db("test")
      .collection("applogs")
      .countDocuments(filter);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          limit: parseInt(limit),
          hasNext: skip + parseInt(limit) < totalCount,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch logs",
      message: error.message 
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

/**
 * GET /api/logs/stats - Get log statistics
 */
router.get('/api/logs/stats', async (req, res) => {
  let client;
  try {
    client = new MongoClient(process.env.MONGO_URI);
    await client.connect();

    const db = client.db("test");
    const collection = db.collection("applogs");

    // Get stats by level
    const levelStats = await collection
      .aggregate([
        {
          $group: {
            _id: "$level",
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ])
      .toArray();

    // Get recent activity (last 24 hours)
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await collection
      .countDocuments({ timestamp: { $gte: last24Hours } });

    // Get total count
    const totalCount = await collection.countDocuments({});

    // Get error trends (last 7 days)
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const errorTrends = await collection
      .aggregate([
        {
          $match: {
            timestamp: { $gte: last7Days },
            level: "error"
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$timestamp"
              }
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { "_id": 1 }
        }
      ])
      .toArray();

    res.json({
      success: true,
      data: {
        levelStats,
        recentActivity: recentCount,
        totalLogs: totalCount,
        errorTrends,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error("Error fetching log stats:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch log statistics",
      message: error.message 
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

/**
 * DELETE /api/logs - Clear logs (with optional filters)
 * Body params:
 * - level: only delete logs of this level
 * - olderThan: delete logs older than this date
 */
router.delete('/api/logs', async (req, res) => {
  let client;
  try {
    const { level, olderThan } = req.body;

    client = new MongoClient(process.env.MONGO_URI);
    await client.connect();

    const filter = {};
    
    if (level) {
      filter.level = level;
    }
    
    if (olderThan) {
      filter.timestamp = { $lt: new Date(olderThan) };
    }

    const result = await client
      .db("test")
      .collection("applogs")
      .deleteMany(filter);

    res.json({
      success: true,
      data: {
        deletedCount: result.deletedCount,
        message: `Successfully deleted ${result.deletedCount} log entries`
      }
    });

  } catch (error) {
    console.error("Error deleting logs:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to delete logs",
      message: error.message 
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

/**
 * GET /api/logs/:id - Get specific log by ID
 */
router.get('/api/logs/:id', async (req, res) => {
  let client;
  try {
    const { id } = req.params;

    client = new MongoClient(process.env.MONGO_URI);
    await client.connect();

    const log = await client
      .db("test")
      .collection("applogs")
      .findOne({ _id: new ObjectId(id) });

    if (!log) {
      return res.status(404).json({
        success: false,
        error: "Log not found"
      });
    }

    res.json({
      success: true,
      data: log
    });

  } catch (error) {
    console.error("Error fetching log:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch log",
      message: error.message 
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

/**
 * GET /api/logs/export - Export logs as JSON/CSV
 * Query params:
 * - format: json or csv (default: json)
 * - all other filter params from GET /api/logs
 */
router.get('/api/logs/export', async (req, res) => {
  let client;
  try {
    const {
      format = 'json',
      level,
      startDate,
      endDate,
      search,
      limit = 1000
    } = req.query;

    client = new MongoClient(process.env.MONGO_URI);
    await client.connect();

    // Build query filter (same as GET /api/logs)
    const filter = {};
    if (level) filter.level = level;
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }
    if (search) {
      filter.$or = [
        { message: { $regex: search, $options: 'i' } },
        { 'meta.traceId': { $regex: search, $options: 'i' } }
      ];
    }

    const logs = await client
      .db("test")
      .collection("applogs")
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .toArray();

    if (format === 'csv') {
      // Convert to CSV
      const csvHeaders = ['timestamp', 'level', 'message', 'traceId', 'spanId'];
      const csvRows = logs.map(log => [
        log.timestamp,
        log.level,
        log.message?.replace(/"/g, '""') || '',
        log.meta?.traceId || '',
        log.meta?.spanId || ''
      ]);
      
      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="logs.csv"');
      res.send(csvContent);
    } else {
      // Return as JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="logs.json"');
      res.json({
        success: true,
        exportedAt: new Date(),
        count: logs.length,
        data: logs
      });
    }

  } catch (error) {
    console.error("Error exporting logs:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to export logs",
      message: error.message 
    });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

/**
 * GET /traces - Get all traces
 */
router.get('/traces', async (req, res) => {
  let client;
  try {
    client = new MongoClient(process.env.MONGO_URI, { useUnifiedTopology: true });
    await client.connect();
    const collection = client.db("test").collection("traces"); // or your actual collection name

    // Get all traces (limit as needed for performance)
    const traces = await collection.find({}).limit(1000).toArray();
    res.json(traces);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

export default router;