#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} = require('@modelcontextprotocol/sdk/types.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Load configuration
function loadConfig() {
  const configPaths = [
    process.env.MCP_CONFIG_PATH,
    path.join(process.cwd(), 'config.json'),
    path.join(__dirname, 'config.json'),
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.mongodb-mcp-config.json')
  ].filter(Boolean);

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        // console.log(`Loaded config from: ${configPath}`);
        return config;
      }
    } catch (error) {
      console.warn(`Failed to load config from ${configPath}:`, error.message);
    }
  }

  throw new Error(`No valid config found. Please create a config.json file with your MongoDB connection details.
    
Example config.json:
{
  "mongodb": {
    "uri": "mongodb+srv://username:password@cluster.mongodb.net/database"
  },
  "server": {
    "name": "mongodb-mcp-server",
    "version": "1.0.0"
  }
}`);
}

const config = loadConfig();

// Question Schema (your original DSA questions)
const questionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  datastructure: [{ type: String, required: true }],
  algorithm: [{ type: String, required: true }],
  constraints: { type: String, required: true },
  testcases: [
    {
      input: { type: String, required: true },
      output: { type: String, required: true }
    }
  ],
  level: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    required: true
  }
}, { timestamps: true });

const Question = mongoose.model('Question', questionSchema, 'DsaQuestions');

// Dynamic Schema Creator for flexible collections
const createDynamicSchema = (schemaDefinition) => {
  const schemaFields = {};
  
  for (const [fieldName, fieldConfig] of Object.entries(schemaDefinition)) {
    if (fieldConfig.type === 'String') {
      schemaFields[fieldName] = { 
        type: String, 
        required: fieldConfig.required || false 
      };
    } else if (fieldConfig.type === 'Number') {
      schemaFields[fieldName] = { 
        type: Number, 
        required: fieldConfig.required || false 
      };
    } else if (fieldConfig.type === 'Boolean') {
      schemaFields[fieldName] = { 
        type: Boolean, 
        required: fieldConfig.required || false 
      };
    } else if (fieldConfig.type === 'Date') {
      schemaFields[fieldName] = { 
        type: Date, 
        required: fieldConfig.required || false 
      };
    } else if (fieldConfig.type === 'Array') {
      if (fieldConfig.itemType === 'String') {
        schemaFields[fieldName] = [{ type: String }];
      } else if (fieldConfig.itemType === 'Number') {
        schemaFields[fieldName] = [{ type: Number }];
      } else {
        schemaFields[fieldName] = [{ type: mongoose.Schema.Types.Mixed }];
      }
    } else if (fieldConfig.type === 'Object') {
      schemaFields[fieldName] = { 
        type: mongoose.Schema.Types.Mixed, 
        required: fieldConfig.required || false 
      };
    }
  }
  
  return new mongoose.Schema(schemaFields, { timestamps: true });
};

class MongoMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: config.server?.name || 'mongodb-mcp-server',
        version: config.server?.version || '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.dynamicModels = new Map(); // Store dynamic models
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
this.server.onerror = (error) => process.stderr.write(`[MCP Error] ${error}\n`);
    process.on('SIGINT', async () => {
      await mongoose.disconnect();
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Original DSA Question Tools
        {
          name: 'add_dsa_question',
          description: 'Add a single DSA question document to the DsaQuestions collection',
          inputSchema: {
            type: 'object',
            properties: {
              question: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Question title or name' },
                  description: { type: 'string', description: 'Problem statement' },
                  datastructure: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'List of data structures used (e.g., ["array", "hash table"])'
                  },
                  algorithm: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'List of algorithms used (e.g., ["hashing", "dynamic programming"])'
                  },
                  constraints: { type: 'string', description: 'Problem constraints as plain text' },
                  testcases: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        input: { type: 'string', description: 'Input format example' },
                        output: { type: 'string', description: 'Output format example' }
                      },
                      required: ['input', 'output']
                    },
                    description: 'Array of test cases'
                  },
                  level: { 
                    type: 'string', 
                    enum: ['easy', 'medium', 'hard'],
                    description: 'Difficulty level of the question'
                  }
                },
                required: ['name', 'description', 'datastructure', 'algorithm', 'constraints', 'testcases', 'level']
              }
            },
            required: ['question']
          }
        },
        {
          name: 'get_dsa_questions',
          description: 'Get DSA questions with optional filters',
          inputSchema: {
            type: 'object',
            properties: {
              filter: {
                type: 'object',
                properties: {
                  level: { 
                    type: 'string', 
                    enum: ['easy', 'medium', 'hard'],
                    description: 'Filter by difficulty level'
                  },
                  datastructure: { 
                    type: 'string',
                    description: 'Filter by data structure (e.g., "array", "linked list")'
                  },
                  algorithm: { 
                    type: 'string',
                    description: 'Filter by algorithm (e.g., "hashing", "dp")'
                  }
                },
                description: 'Optional filters for querying questions'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of questions to return (default: 10)',
                default: 10
              }
            }
          }
        },
        // New Generic Collection Tools
        {
          name: 'get_all_collections',
          description: 'Get list of all collection names in the database',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'create_collection',
          description: 'Create a new collection with a custom schema',
          inputSchema: {
            type: 'object',
            properties: {
              collectionName: { 
                type: 'string', 
                description: 'Name of the collection to create' 
              },
              schema: {
                type: 'object',
                description: 'Schema definition for the collection',
                additionalProperties: {
                  type: 'object',
                  properties: {
                    type: { 
                      type: 'string', 
                      enum: ['String', 'Number', 'Boolean', 'Date', 'Array', 'Object'],
                      description: 'Field data type'
                    },
                    required: { 
                      type: 'boolean', 
                      default: false,
                      description: 'Whether field is required'
                    },
                    itemType: { 
                      type: 'string', 
                      enum: ['String', 'Number', 'Boolean', 'Mixed'],
                      description: 'Type of items in array (only for Array type)'
                    }
                  },
                  required: ['type']
                }
              }
            },
            required: ['collectionName', 'schema']
          }
        },
        {
          name: 'delete_collection',
          description: 'Delete an entire collection and all its documents',
          inputSchema: {
            type: 'object',
            properties: {
              collectionName: { 
                type: 'string', 
                description: 'Name of the collection to delete' 
              }
            },
            required: ['collectionName']
          }
        },
        {
          name: 'get_documents',
          description: 'Get documents from any collection with optional filters',
          inputSchema: {
            type: 'object',
            properties: {
              collectionName: { 
                type: 'string', 
                description: 'Name of the collection' 
              },
              filter: { 
                type: 'object', 
                description: 'MongoDB filter object (optional)',
                additionalProperties: true
              },
              limit: { 
                type: 'number', 
                default: 10, 
                description: 'Maximum number of documents to return' 
              },
              sort: {
                type: 'object',
                description: 'Sort criteria (e.g., {"createdAt": -1})',
                additionalProperties: true
              }
            },
            required: ['collectionName']
          }
        },
        {
          name: 'add_document',
          description: 'Add a document to any collection',
          inputSchema: {
            type: 'object',
            properties: {
              collectionName: { 
                type: 'string', 
                description: 'Name of the collection' 
              },
              document: { 
                type: 'object', 
                description: 'Document data to insert',
                additionalProperties: true
              }
            },
            required: ['collectionName', 'document']
          }
        },
        {
          name: 'update_collection_name',
          description: 'Rename a collection',
          inputSchema: {
            type: 'object',
            properties: {
              oldName: { 
                type: 'string', 
                description: 'Current collection name' 
              },
              newName: { 
                type: 'string', 
                description: 'New collection name' 
              }
            },
            required: ['oldName', 'newName']
          }
        },
        {
          name: 'get_collection_stats',
          description: 'Get statistics about the DsaQuestions collection',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        await this.ensureConnected();
        
        switch (request.params.name) {
          // Original DSA Question Tools
          case 'add_dsa_question':
            return await this.addDsaQuestion(request.params.arguments);
          case 'get_dsa_questions':
            return await this.getDsaQuestions(request.params.arguments);
          case 'get_collection_stats':
            return await this.getCollectionStats();
          
          // New Generic Collection Tools
          case 'get_all_collections':
            return await this.getAllCollections();
          case 'create_collection':
            return await this.createCollection(request.params.arguments);
          case 'delete_collection':
            return await this.deleteCollection(request.params.arguments);
          case 'get_documents':
            return await this.getDocuments(request.params.arguments);
          case 'add_document':
            return await this.addDocument(request.params.arguments);
          case 'update_collection_name':
            return await this.updateCollectionName(request.params.arguments);
          
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });
  }

  async ensureConnected() {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(config.mongodb.uri, config.mongodb.options || {});
      // console.log('Connected to MongoDB');
    }
  }

  // Original DSA Question Methods
  async addDsaQuestion(args) {
    const { question } = args;
    
    try {
      const newQuestion = new Question(question);
      const savedQuestion = await newQuestion.save();
      
      return {
        content: [
          {
            type: 'text',
            text: `Successfully added DSA question: ${savedQuestion.name}\nID: ${savedQuestion._id}\nCreated at: ${savedQuestion.createdAt}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to add question: ${error.message}`);
    }
  }

  async getDsaQuestions(args = {}) {
    const { filter = {}, limit = 10 } = args;
    
    try {
      let query = {};
      
      if (filter.level) {
        query.level = filter.level;
      }
      
      if (filter.datastructure) {
        query.datastructure = { $in: [filter.datastructure] };
      }
      
      if (filter.algorithm) {
        query.algorithm = { $in: [filter.algorithm] };
      }
      
      const questions = await Question.find(query).limit(limit).sort({ createdAt: -1 });
      
      return {
        content: [
          {
            type: 'text',
            text: `Found ${questions.length} DSA questions:\n\n${questions.map(q => 
              `**${q.name}** (${q.level})\n` +
              `ID: ${q._id}\n` +
              `Data Structures: ${q.datastructure.join(', ')}\n` +
              `Algorithms: ${q.algorithm.join(', ')}\n` +
              `Test Cases: ${q.testcases.length}\n` +
              `Created: ${q.createdAt.toLocaleDateString()}\n`
            ).join('\n')}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get questions: ${error.message}`);
    }
  }

  async getCollectionStats() {
    try {
      const totalQuestions = await Question.countDocuments();
      const levelStats = await Question.aggregate([
        { $group: { _id: '$level', count: { $sum: 1 } } }
      ]);
      
      const dsStats = await Question.aggregate([
        { $unwind: '$datastructure' },
        { $group: { _id: '$datastructure', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);
      
      const algoStats = await Question.aggregate([
        { $unwind: '$algorithm' },
        { $group: { _id: '$algorithm', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);
      
      const levelBreakdown = levelStats.map(stat => `${stat._id}: ${stat.count}`).join(', ');
      const topDataStructures = dsStats.map(stat => `${stat._id}: ${stat.count}`).join(', ');
      const topAlgorithms = algoStats.map(stat => `${stat._id}: ${stat.count}`).join(', ');
      
      return {
        content: [
          {
            type: 'text',
            text: `**DsaQuestions Collection Stats**\n\n` +
                  `Total Questions: ${totalQuestions}\n\n` +
                  `**Level Distribution:**\n${levelBreakdown}\n\n` +
                  `**Top Data Structures:**\n${topDataStructures}\n\n` +
                  `**Top Algorithms:**\n${topAlgorithms}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get collection stats: ${error.message}`);
    }
  }

  // New Generic Collection Methods
  async getAllCollections() {
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();
      const collectionInfo = collections.map(col => ({
        name: col.name,
        type: col.type || 'collection'
      }));
      
      return {
        content: [
          {
            type: 'text',
            text: `**All Collections in Database:**\n\n${collectionInfo.map(col => 
              `• ${col.name} (${col.type})`
            ).join('\n')}\n\nTotal: ${collectionInfo.length} collections`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get collections: ${error.message}`);
    }
  }

  async createCollection(args) {
    const { collectionName, schema } = args;
    
    try {
      const mongooseSchema = createDynamicSchema(schema);
      const Model = mongoose.model(collectionName, mongooseSchema, collectionName);
      this.dynamicModels.set(collectionName, Model);
      
      // Create the collection
      await Model.createCollection();
      
      return {
        content: [{
          type: 'text',
          text: `Successfully created collection: **${collectionName}**\n\n**Schema:**\n${JSON.stringify(schema, null, 2)}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to create collection: ${error.message}`);
    }
  }

  async deleteCollection(args) {
    const { collectionName } = args;
    
    try {
      await mongoose.connection.db.dropCollection(collectionName);
      this.dynamicModels.delete(collectionName);
      
      return {
        content: [{
          type: 'text',
          text: `Successfully deleted collection: **${collectionName}** and all its documents`
        }]
      };
    } catch (error) {
      if (error.message.includes('ns not found')) {
        throw new Error(`Collection "${collectionName}" does not exist`);
      }
      throw new Error(`Failed to delete collection: ${error.message}`);
    }
  }

  async getDocuments(args) {
    const { collectionName, filter = {}, limit = 10, sort = { createdAt: -1 } } = args;
    
    try {
      let Model = this.dynamicModels.get(collectionName);
      
      if (!Model) {
        // Create a generic model for existing collections
        const genericSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
        Model = mongoose.model(collectionName + '_Generic', genericSchema, collectionName);
        this.dynamicModels.set(collectionName, Model);
      }
      
      const documents = await Model.find(filter).limit(limit).sort(sort).lean();
      
      return {
        content: [{
          type: 'text',
          text: `**Found ${documents.length} documents in "${collectionName}":**\n\n${JSON.stringify(documents, null, 2)}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get documents from ${collectionName}: ${error.message}`);
    }
  }

  async addDocument(args) {
    const { collectionName, document } = args;
    
    try {
      let Model = this.dynamicModels.get(collectionName);
      
      if (!Model) {
        const genericSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
        Model = mongoose.model(collectionName + '_Add', genericSchema, collectionName);
        this.dynamicModels.set(collectionName, Model);
      }
      
      const newDoc = new Model(document);
      const savedDoc = await newDoc.save();
      
      return {
        content: [{
          type: 'text',
          text: `Successfully added document to **${collectionName}**:\n\n**Document ID:** ${savedDoc._id}\n**Created:** ${savedDoc.createdAt}\n\n**Data:**\n${JSON.stringify(savedDoc.toObject(), null, 2)}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to add document to ${collectionName}: ${error.message}`);
    }
  }

  async updateCollectionName(args) {
    const { oldName, newName } = args;
    
    try {
      await mongoose.connection.db.collection(oldName).rename(newName);
      
      // Update model mapping
      const model = this.dynamicModels.get(oldName);
      if (model) {
        this.dynamicModels.delete(oldName);
        this.dynamicModels.set(newName, model);
      }
      
      return {
        content: [{
          type: 'text',
          text: `Successfully renamed collection from **${oldName}** to **${newName}**`
        }]
      };
    } catch (error) {
      if (error.message.includes('source namespace does not exist')) {
        throw new Error(`Collection "${oldName}" does not exist`);
      }
      throw new Error(`Failed to rename collection: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    // console.log('MongoDB MCP server running on stdio');
  }
}

const server = new MongoMCPServer();
server.run().catch(console.error);