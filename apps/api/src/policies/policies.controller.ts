import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { PoliciesService } from './policies.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import type { PolicyType } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';

@Controller('policies')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  /**
   * Public endpoint: Get active policy by type
   * GET /policies/active?type=TERMS_AND_CONDITIONS
   */
  @Get('active')
  findActive(@Query('type') type: PolicyType) {
    return this.policiesService.findActiveByType(type);
  }

  /**
   * Public endpoint: Get all active policies
   * GET /policies/active/all
   */
  @Get('active/all')
  findAllActive() {
    return this.policiesService.findAllActive();
  }

  /**
   * Admin endpoint: Get all policies
   * GET /policies
   * TODO: Add admin auth guard
   */
  @Get()
  findAll() {
    return this.policiesService.findAll();
  }

  /**
   * Admin endpoint: Get all versions of a policy type
   * GET /policies/type/:type
   * TODO: Add admin auth guard
   */
  @Get('type/:type')
  findByType(@Param('type') type: PolicyType) {
    return this.policiesService.findByType(type);
  }

  /**
   * Admin endpoint: Get specific policy by ID
   * GET /policies/:id
   * TODO: Add admin auth guard
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.policiesService.findOne(id);
  }

  /**
   * Admin endpoint: Create new policy version
   * POST /policies
   * TODO: Add admin auth guard
   */
  @Post()
  create(@Body() createPolicyDto: CreatePolicyDto) {
    return this.policiesService.create(createPolicyDto);
  }

  /**
   * Admin endpoint: Update policy
   * PATCH /policies/:id
   * TODO: Add admin auth guard
   */
  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePolicyDto: UpdatePolicyDto) {
    return this.policiesService.update(id, updatePolicyDto);
  }

  /**
   * Admin endpoint: Activate a policy version
   * POST /policies/:id/activate
   * TODO: Add admin auth guard
   */
  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.policiesService.activate(id);
  }

  /**
   * Admin endpoint: Delete policy version
   * DELETE /policies/:id
   * TODO: Add admin auth guard
   */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.policiesService.remove(id);
  }
}
