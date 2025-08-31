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

// Question Schema
const questionSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Question title or name
  description: { type: String, required: true }, // Problem statement
  datastructure: [{ type: String, required: true }], // List of data structures used
  algorithm: [{ type: String, required: true }], // List of algorithms used
  constraints: { type: String, required: true }, // Problem constraints as plain text
  testcases: [
    {
      input: { type: String, required: true },  // Input format example
      output: { type: String, required: true }  // Output format example
    }
  ],
  level: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    required: true
  } // Difficulty level of the question
}, { timestamps: true });

const Question = mongoose.model('Question', questionSchema, 'DsaQuestions');

// MongoDB Connection
const MONGODB_URI = 'mongodb+srv://taqariUser:HumanClan%401234@cluster0.arqfqjr.mongodb.net/taqari?retryWrites=true&w=majority&appName=Cluster0';


class MongoMCPServer {


  constructor() {
    this.server = new Server(
      {
        name: 'mongodb-taqari-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await mongoose.disconnect();
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
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
          name: 'add_multiple_dsa_questions',
          description: 'Add multiple DSA question documents to the DsaQuestions collection',
          inputSchema: {
            type: 'object',
            properties: {
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Question title or name' },
                    description: { type: 'string', description: 'Problem statement' },
                    datastructure: { 
                      type: 'array', 
                      items: { type: 'string' },
                      description: 'List of data structures used'
                    },
                    algorithm: { 
                      type: 'array', 
                      items: { type: 'string' },
                      description: 'List of algorithms used'
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
              }
            },
            required: ['questions']
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
        {
          name: 'delete_dsa_question',
          description: 'Delete a DSA question by ID',
          inputSchema: {
            type: 'object',
            properties: {
              questionId: {
                type: 'string',
                description: 'MongoDB ObjectId of the question to delete'
              }
            },
            required: ['questionId']
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
          case 'add_dsa_question':
            return await this.addDsaQuestion(request.params.arguments);
          
          case 'add_multiple_dsa_questions':
            return await this.addMultipleDsaQuestions(request.params.arguments);
          
          case 'get_dsa_questions':
            return await this.getDsaQuestions(request.params.arguments);
          
          case 'delete_dsa_question':
            return await this.deleteDsaQuestion(request.params.arguments);
          
          case 'get_collection_stats':
            return await this.getCollectionStats();
          
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
      await mongoose.connect(MONGODB_URI);
      console.log('Connected to MongoDB Atlas');
    }
  }

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

  async addMultipleDsaQuestions(args) {
    const { questions } = args;
    
    try {
      const savedQuestions = await Question.insertMany(questions);
      
      return {
        content: [
          {
            type: 'text',
            text: `Successfully added ${savedQuestions.length} DSA questions:\n${savedQuestions.map(q => `- ${q.name} (ID: ${q._id})`).join('\n')}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to add multiple questions: ${error.message}`);
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

  async deleteDsaQuestion(args) {
    const { questionId } = args;
    
    try {
      const deletedQuestion = await Question.findByIdAndDelete(questionId);
      
      if (!deletedQuestion) {
        throw new Error('Question not found');
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `Successfully deleted DSA question: ${deletedQuestion.name} (ID: ${questionId})`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to delete question: ${error.message}`);
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('MongoDB MCP server running on stdio');
  }
}

const server = new MongoMCPServer();
server.run().catch(console.error);