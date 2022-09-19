import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';

import * as bcrypt from 'bcrypt'
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from 'src/common/dto/pagination.dto';

import { validate as isUUID } from 'uuid'

  


@Injectable()
export class AuthService { 

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService, 
  ){}


  async create(createUserDto: CreateUserDto) {
    try{
      const {password, ...userData}=createUserDto;
      const user=this.userRepository.create({
        ...userData,
       password: bcrypt.hashSync(password, 10)
      });
      await this.userRepository.save(user);
      const {password:pass, ...resto }=user;
      return resto;
    }catch(error){
      this.handleDBErrors(error)
    }
  }

  async login(loginUserDto: LoginUserDto){
    const {password, email}=loginUserDto;
    const user=await this.userRepository.findOne({
      where: {email},
      select: {email: true, password: true, isActive: true }, //Si no hago esto no me devuelve la contraseña
    });
    if(!user)
      throw new UnauthorizedException('Credentials are not valid (email)')
    
    if(!bcrypt.compareSync(password, user.password))
      throw new UnauthorizedException('Credentials are not valid (password)')
    
    if(!user.isActive)
      throw new UnauthorizedException('Inactive User - talk with the admin')

      return {
        ...user,
        token: this.getJWT({email: user.email})
      };
  
  }


  async findAll(paginationDto: PaginationDto ) {
    const {limit=10, offset=0}=paginationDto;
    const users=await this.userRepository.find({
      take: limit,
      skip: offset,
      relations: {
      }
    });
    
    return users.map((user)=>{
      let {password, ...resto}=user;
      return resto
    })  
  }  


  async findOne(term: string) {
    
    let users: User[];
    const queryBuilder=this.userRepository.createQueryBuilder('us');
    
    isUUID(term)
      ? users=[await this.userRepository.findOneBy({id: term})]
      : users=await queryBuilder.where('email =:email or rol =:rol',{
        email: term.toLowerCase(),
        rol: term.toLowerCase(),
        })
        .getMany();        
    if(!users) throw new NotFoundException(`Users with term ${term} not found`)

    return users.map((user)=>{
      let {password, ...resto}=user;
      return resto
    }) 
  }



  async update(id: string, updateAuthDto: UpdateAuthDto) {    
    const {email, password, ...toUpdate}=updateAuthDto;
    let user=await this.userRepository.preload({
      id,
      ...toUpdate
    });
    if(!user) throw new NotFoundException(`User with id ${id} not found`)
    try{

      let userUpdate={password:user.password};
      (password)
        ? userUpdate={ ...user, ...toUpdate, password: bcrypt.hashSync(password, 10)}
        : userUpdate={ ...user,  ...toUpdate, password: user.password }

      await this.userRepository.save(userUpdate);
      
      const {password: password2, ...restUserUpdate}=userUpdate
      return restUserUpdate;

    }catch(error){
      this.handleDBErrors(error)
    }      
  }


  async updateUser(id: string, updateAuthDto: UpdateUserDto) {  
      
    const {password, newPassword, ...toUpdate}=updateAuthDto;

    console.log('updateAuthDto ', updateAuthDto)
    console.log('newPassword ',newPassword)

    let user=await this.userRepository.preload({
      id,
      ...toUpdate
    });

    console.log('user ', user)


    if(!user) throw new NotFoundException(`User with id ${id} not found`) 
    
    
    if(!bcrypt.compareSync(password, user.password))
      throw new UnauthorizedException('Credentials are not valid (password)')
    
      console.log('password correcto ')
    try{ 
      
      let userUpdate ={password: user.password} ;

      (newPassword)
        ? userUpdate={ ...user, ...toUpdate,
        password: bcrypt.hashSync(newPassword, 10)
        }

        : userUpdate={ ...user,  ...toUpdate, password: user.password     
        }


      await this.userRepository.save(userUpdate);

      const {password: password2, ...restUserUpdate}=userUpdate
      return restUserUpdate;
    }catch(error){
      this.handleDBErrors(error)
    }  
    return {
      updateAuthDto,
      id      
    }    
  }


  async remove(id: string) {    
    let user=await this.userRepository.preload({id});
    console.log('user es ..',user);
    if(!user) throw new NotFoundException(`User with id ${id} not found`)
    try{
      const userUpdate={
        ...user,
       isActive: false,
      }
      await this.userRepository.save(userUpdate);
      return;
    }catch(error){
      this.handleDBErrors(error)
    } 
  }

  private getJWT(payload: JwtPayload){
    const token=this.jwtService.sign(payload);
    return token;
  }


  private handleDBErrors(error: any){
    if(error.code==='23505')
      throw new BadRequestException(error.detail);
    console.log(error)
    throw new InternalServerErrorException('Please check server logs')
  }
}
