import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CreateAdminDto } from './dto/create-admin.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Admin } from './entities/admin.entity';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
  ) {}

  async create(createAdminDto: CreateAdminDto) {
    try {
      this.logger.log(`Попытка создать админа: ${createAdminDto.userName}`);

      const isExist = await this.adminRepository.findOne({
        where: { userName: createAdminDto.userName },
      });

      if (isExist) {
        this.logger.warn(
          `Админ с userName="${createAdminDto.userName}" уже существует`,
        );
        throw new HttpException(
          'Админ с таким userName уже создан',
          HttpStatus.CONFLICT,
        );
      }

      const hashed = await this.hashPassword(createAdminDto.password);

      const newAdmin = this.adminRepository.create({
        ...createAdminDto,
        password: hashed,
      });

      await this.adminRepository.save(newAdmin);

      this.logger.log(
        `✅ Админ создан: id=${newAdmin.id}, userName=${newAdmin.userName}`,
      );
      return newAdmin;
    } catch (error: any) {
      this.logger.error(
        `Ошибка при создании админа: ${error.message}`,
        error.stack,
      );

      // если error уже HttpException — пробрасываем
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Ошибка при создании администратора',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll() {
    try {
      this.logger.log(`Запрос списка администраторов`);
      return await this.adminRepository.find();
    } catch (error: any) {
      this.logger.error(
        `Ошибка при получении списка администраторов`,
        error.stack,
      );
      throw new HttpException(
        'Ошибка при получении списка администраторов',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(options: Partial<Admin>) {
    try {
      this.logger.log(`Поиск админа по параметрам: ${JSON.stringify(options)}`);
      const admin = await this.adminRepository.findOne({ where: options });

      if (!admin) {
        this.logger.warn(
          `Админ не найден по параметрам: ${JSON.stringify(options)}`,
        );
      }

      return admin;
    } catch (error: any) {
      this.logger.error(`Ошибка при поиске админа`, error.stack);
      throw new HttpException(
        'Ошибка при поиске администратора',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async remove(id: number) {
    try {
      this.logger.warn(`Удаление админа id=${id}`);
      const result = await this.adminRepository.delete(id);

      if (result.affected === 0) {
        this.logger.warn(`Админ с id=${id} не найден`);
        throw new HttpException(
          `Админ с id=${id} не найден`,
          HttpStatus.NOT_FOUND,
        );
      }

      this.logger.log(`✅ Админ с id=${id} успешно удален`);
      return { message: `Админ с id=${id} удален` };
    } catch (error: any) {
      this.logger.error(`Ошибка при удалении админа id=${id}`, error.stack);
      throw new HttpException(
        'Ошибка при удалении администратора',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async hashPassword(password: string) {
    try {
      return await bcrypt.hash(password, await bcrypt.genSalt(12));
    } catch (error: any) {
      this.logger.error('Ошибка при хэшировании пароля', error.stack);
      throw new HttpException(
        'Ошибка при обработке пароля',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async validatePassword(password: string, hash: string) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error: any) {
      this.logger.error('Ошибка при проверке пароля', error.stack);
      throw new HttpException(
        'Ошибка при проверке пароля',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
