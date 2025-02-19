/* eslint-disable no-useless-constructor */
/* eslint-disable no-param-reassign */
/* eslint-disable class-methods-use-this */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Users } from '../entities/user.entity';
import { Snippets } from '../entities/snippet.entity';
import { User } from './interfaces/users.interface';
import { RecoverUserDto } from './dto/recover-user.dto';
import { cipher, decipher } from './secure/cipher';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Users)
    private usersRepository: Repository<Users>,
    @InjectRepository(Snippets)
    private snippetsRepository: Repository<Snippets>,
    private readonly mailerService: MailerService,
  ) {}

  async findOne(id: number): Promise<Users> {
    return this.usersRepository.findOneBy({ id });
  }

  async find(email: string): Promise<Users> {
    return this.usersRepository.findOneBy({ email });
  }

  async findByLogin(login: string): Promise<Users> {
    return this.usersRepository.findOneBy({ login });
  }

  create(createUserDto: CreateUserDto): Promise<Users> {
    const user = new Users();
    user.login = createUserDto.login;
    user.email = createUserDto.email.toLowerCase();
    user.password = createUserDto.password;
    return this.usersRepository.save(user);
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<Users> {
    const { ...data } = updateUserDto;
    const currentUser = await this.usersRepository.findOneBy({ id });
    const updatedUser = this.usersRepository.merge(currentUser, data);
    await this.usersRepository.save(updatedUser);
    return updatedUser;
  }

  async recover({ email, frontendUrl }: RecoverUserDto): Promise<void> {
    const recoverHash = await cipher(email);
    const currentUser = await this.find(email);
    await this.usersRepository.update(currentUser.id, {
      recover_hash: recoverHash,
    });

    setTimeout(async () => {
      await this.usersRepository.update(currentUser.id, { recover_hash: null });
    }, 900000);

    const url = `${frontendUrl}/recovery/${recoverHash}`;

    this.mailerService.sendMail({
      to: email,
      from: 'noreply@runit.com',
      subject: 'Ссылка для изменения пароля на сайте RunIT.ru',
      template: 'recover',
      context: {
        url,
      },
    });
  }

  async checkHash(hash: string): Promise<{ id: number | null }> {
    const email = await decipher(Buffer.from(hash, 'hex'));
    const currentUser = await this.find(email);

    if (currentUser && currentUser.recover_hash === hash) {
      await this.usersRepository.update(currentUser.id, { recover_hash: null });
      return { id: currentUser.id };
    }
    return { id: null };
  }

  async delete(id: number): Promise<void> {
    await this.usersRepository.delete(id);
  }

  findAll(): Promise<Users[]> {
    return this.usersRepository.find();
  }

  async getData({ id }: User): Promise<any> {
    const currentUser = await this.usersRepository.findOneBy({ id });
    const snippets = await this.snippetsRepository.find({
      relations: {
        user: true,
      },
      where: {
        user: {
          id,
        },
      },
    });
    return { currentUser, snippets };
  }
}
