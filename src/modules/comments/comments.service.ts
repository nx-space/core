import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Comments } from "../../shared/entities/comments.entity";
import { CreateCommentsDto } from "../../shared/dto/create-Comments-dto";
import BlockedKeywords = require("./block-keywords.json");
import { UsersService } from "../users/users.service";
import { delObjXss } from "utils/xss.util";
@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comments)
    private CommentsRepository: Repository<Comments>,
    private usersService: UsersService
  ) {}

  async getComments(type: string, cid: number): Promise<Comments[]> {
    return await this.CommentsRepository.find({
      type: type,
      cid: cid,
      state: 1,
    });
  }

  async list(query: any) {
    switch (query.type){
    case 'all':
      return await this.CommentsRepository.find({
        order: {
          cid: query.order === 'ASC' ? 'ASC' : 'DESC',
        },
      })
    case 'limit':
      let page = query.page
      if (page < 1 || isNaN(page)) {
        page = 1;
      }
      const limit = query.limit || 10;
      const skip = (page - 1) * limit;
      return await this.CommentsRepository.find({
        skip: skip,
        take: limit,
        order: {
          cid: query.order === 'ASC' ? 'ASC' : 'DESC',
        },
      });
    case 'num':
      return await this.CommentsRepository.count()
    case 'uncheck':
      return await this.CommentsRepository.find({
        where: {
          state: 0,
        },
        order: {
          cid: query.order === 'ASC' ? 'ASC' : 'DESC',
        },
      });
    case 'uncheck_num':
      return await this.CommentsRepository.count({
        state: 0,
      });
    default:
      return await this.CommentsRepository.find({
        order: {
          cid: query.order === 'ASC' ? 'ASC' : 'DESC',
        },
      })
    }
  }

  async changeComments(data: CreateCommentsDto) {
    // 更新评论
    return await this.CommentsRepository.update(data.cid, data);
  }

  async createComments(data: CreateCommentsDto) {
    const isBlock = [...BlockedKeywords].some((keyword) =>
      new RegExp(keyword, "ig").test(data.content)
    );
    const contentByte = Buffer.byteLength(data.content, "utf8");
    if (contentByte > 200000) { // 200KB
      Logger.warn(`检测到一条过长评论提交 ${contentByte} 字节`, "CommentsService");
      throw new BadRequestException("评论过长，请删减后再试")
    }
    if (data.content.length > 500) {
      Logger.warn(`检测到一条过长评论提交 ${data.content.length} 字`, "CommentsService");
      throw new BadRequestException("评论过长，请删减后再试")
    }
    data = delObjXss(data);
    if (isBlock) {
      Logger.warn(`检测到一条垃圾评论提交`, "CommentsService");
      throw new HttpException(
        "评论有敏感词，请检查后重新提交",
        HttpStatus.BAD_REQUEST
      );
    }
    const isMaster = await this.usersService.findOne(data.author);
    if (isMaster && data.isOwner != 1) {
      Logger.warn(`检测到一条伪造评论提交`, "CommentsService");
      throw new BadRequestException(
        '用户名与主人重名啦, 但是你好像并不是我的主人唉',
      )
    }
    return await this.CommentsRepository.save(data);
  }

  async deleteComments(cid) {
    return await this.CommentsRepository.delete({
      // Use a unique CID for deletion
      cid: cid,
    });
  }
}